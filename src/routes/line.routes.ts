import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../prisma.js";

const router = Router();

/* =========================================================
   Helpers
   ========================================================= */
function isLineSignatureValid(bodyText: string, signature: string | undefined) {
  const secret = process.env.LINE_CHANNEL_SECRET;
  if (!secret || !signature) return false;

  const hash = crypto
    .createHmac("SHA256", secret)
    .update(bodyText)
    .digest("base64");

  return hash === signature;
}

async function replyMessage(
  replyToken: string,
  messages: Array<{ type: "text"; text: string }>
) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");

  const res = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      replyToken,
      messages,
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("LINE reply error:", text);
  }
}

function normalizeCode(text: string) {
  return text.trim().toUpperCase().replace(/\s+/g, "");
}

/* =========================================================
   POST /api/v1/line/webhook
   ========================================================= */
router.post("/webhook", async (req: any, res) => {
  try {
    const rawBody =
      typeof req.rawBody === "string"
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
        ? req.rawBody.toString("utf8")
        : JSON.stringify(req.body ?? {});

    const signature = req.header("x-line-signature");
    const body = req.body ?? {};
    const events = Array.isArray(body.events) ? body.events : [];

    if (process.env.LINE_CHANNEL_SECRET && signature) {
      const ok = isLineSignatureValid(rawBody, signature);
      if (!ok) {
        return res.status(401).send("Invalid signature");
      }
    }

    for (const event of events) {
      try {
        if (event.type !== "message") continue;
        if (event.message?.type !== "text") continue;

        const replyToken = event.replyToken;
        const lineUserId = event.source?.userId;
        const text = String(event.message?.text ?? "").trim();

        if (!replyToken || !lineUserId || !text) continue;

        console.log("LINE incoming text:", text, "from:", lineUserId);

        const code = normalizeCode(text);

        const roomCode = await prisma.tenantRoomCode.findFirst({
          where: {
            code,
          },
          include: {
            room: {
              select: {
                id: true,
                roomNo: true,
                condoId: true,
                condo: {
                  select: {
                    id: true,
                    nameTh: true,
                    nameEn: true,
                  },
                },
              },
            },
            contract: {
              select: {
                id: true,
                tenantUserId: true,
              },
            },
          },
        });

        if (!roomCode) {
          await replyMessage(replyToken, [
            {
              type: "text",
              text: "ไม่พบรหัสนี้ในระบบ กรุณาตรวจสอบอีกครั้ง",
            },
          ]);
          continue;
        }

        if (roomCode.status !== "ACTIVE") {
          await replyMessage(replyToken, [
            {
              type: "text",
              text: "รหัสนี้ไม่สามารถใช้งานได้แล้ว",
            },
          ]);
          continue;
        }

        if (roomCode.expiresAt && new Date(roomCode.expiresAt) < new Date()) {
          await prisma.tenantRoomCode.update({
            where: { id: roomCode.id },
            data: { status: "EXPIRED" },
          });

          await replyMessage(replyToken, [
            {
              type: "text",
              text: "รหัสนี้หมดอายุแล้ว กรุณาติดต่อเจ้าของหรือขอรหัสใหม่",
            },
          ]);
          continue;
        }

        let tenantUserId = roomCode.contract?.tenantUserId ?? null;

        const existingLine = await prisma.lineAccount.findUnique({
          where: { lineUserId },
          select: { id: true, userId: true, isActive: true },
        });

        if (existingLine && tenantUserId && existingLine.userId !== tenantUserId) {
          await replyMessage(replyToken, [
            {
              type: "text",
              text: "LINE นี้ถูกเชื่อมกับบัญชีผู้ใช้อื่นแล้ว",
            },
          ]);
          continue;
        }

        await prisma.$transaction(async (tx) => {
          if (!tenantUserId) {
            if (existingLine?.userId) {
              tenantUserId = existingLine.userId;
            } else {
              const createdTenant = await tx.user.create({
                data: {
                  role: "TENANT",
                  name: `Tenant ${roomCode.room?.roomNo ?? ""}`.trim() || "Tenant",
                  isActive: true,
                  verifyChannel: "PHONE",
                },
                select: { id: true },
              });

              tenantUserId = createdTenant.id;
            }
          }

          await tx.lineAccount.upsert({
            where: { lineUserId },
            update: {
              userId: tenantUserId!,
              isActive: true,
              linkedAt: new Date(),
            },
            create: {
              userId: tenantUserId!,
              lineUserId,
              linkedAt: new Date(),
              isActive: true,
            },
          });

          await tx.tenantRoomCode.update({
            where: { id: roomCode.id },
            data: {
              status: "USED",
              usedAt: new Date(),
              usedByUserId: tenantUserId!,
            },
          });

          const existingResidency = await tx.tenantResidency.findFirst({
            where: {
              tenantUserId: tenantUserId!,
              condoId: roomCode.condoId,
              roomId: roomCode.roomId,
              status: "ACTIVE",
            },
            select: { id: true },
          });

          if (!existingResidency) {
            await tx.tenantResidency.create({
              data: {
                tenantUserId: tenantUserId!,
                condoId: roomCode.condoId,
                roomId: roomCode.roomId,
                contractId: roomCode.contractId ?? null,
                status: "ACTIVE",
                startDate: new Date(),
              },
            });
          }

          const lineAccountRow = await tx.lineAccount.findUnique({
            where: { lineUserId },
            select: { id: true },
          });

          await tx.tenantOnboardingEvent.create({
            data: {
              tenantUserId: tenantUserId!,
              lineAccountId: lineAccountRow?.id ?? null,
              roomCodeId: roomCode.id,
              channel: "LINE",
              eventType: "LINK_SUCCESS",
              message: `Tenant linked by access code ${roomCode.code}`,
            },
          });
        });

        console.log("BIND SUCCESS:", {
          code: roomCode.code,
          lineUserId,
          roomId: roomCode.roomId,
          condoId: roomCode.condoId,
        });

        const condoName =
          roomCode.room?.condo?.nameTh ??
          roomCode.room?.condo?.nameEn ??
          "RentSphere";

        await replyMessage(replyToken, [
          {
            type: "text",
            text:
              `เชื่อมบัญชีสำเร็จแล้ว\n` +
              `คอนโด: ${condoName}\n` +
              `ห้อง: ${roomCode.room?.roomNo ?? "-"}\n\n` +
              `ตอนนี้คุณสามารถใช้งานระบบผู้เช่าได้แล้ว`,
          },
        ]);
      } catch (eventErr) {
        console.error("LINE event error:", eventErr);

        if (event?.replyToken) {
          try {
            await replyMessage(event.replyToken, [
              {
                type: "text",
                text: "ระบบเกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง",
              },
            ]);
          } catch (replyErr) {
            console.error("LINE fallback reply error:", replyErr);
          }
        }
      }
    }

    return res.status(200).send("OK");
  } catch (err: any) {
    console.error("LINE WEBHOOK ERROR:", err);
    return res.status(200).send("OK");
  }
});

export default router;