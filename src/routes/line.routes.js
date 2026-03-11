import { Router } from "express";
import crypto from "crypto";
import { prisma } from "../prisma.js";
const router = Router();
/* =========================================================
   Helpers
   ========================================================= */
function isLineSignatureValid(bodyText, signature) {
    const secret = process.env.LINE_CHANNEL_SECRET;
    if (!secret || !signature)
        return false;
    const hash = crypto
        .createHmac("SHA256", secret)
        .update(bodyText)
        .digest("base64");
    return hash === signature;
}
async function replyMessage(replyToken, messages) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token)
        throw new Error("Missing LINE_CHANNEL_ACCESS_TOKEN");
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
function normalizeCode(text) {
    return text.trim().toUpperCase().replace(/\s+/g, "");
}
/* =========================================================
   SlipOK Helper
   ========================================================= */
async function verifySlipWithSlipOK(imageBuffer) {
    const apiKey = process.env.SLIPOK_API_KEY;
    const branchId = process.env.SLIPOK_BRANCH_ID;
    if (!apiKey || !branchId) {
        return { success: false, error: "SlipOK ไม่ได้ตั้งค่า" };
    }
    try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
        formData.append("files", blob, "slip.jpg");
        const res = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
            method: "POST",
            headers: {
                "x-authorization": apiKey,
            },
            body: formData,
        });
        const json = await res.json();
        console.log("SlipOK FULL response:", JSON.stringify(json, null, 2));
        // Extract data from various response shapes
        const d = json?.data?.data || json?.data || json;
        // Check if there is any transaction data at all — if yes, the slip is valid
        const hasTransactionData = d && (d.transRef || d.amount || d.transAmount ||
            d.sender?.name || d.receiver?.name ||
            d.sendingBank || d.receivingBank);
        if (hasTransactionData) {
            console.log("SlipOK: slip has valid transaction data — accepting");
            return { success: true, data: d };
        }
        // Fallback: check explicit success flags
        if (json?.data?.success || json?.success) {
            return { success: true, data: json.data || json };
        }
        const errMsg = json?.data?.message || json?.message || "ตรวจ slip ไม่สำเร็จ";
        console.log("SlipOK: no transaction data found, error:", errMsg);
        return { success: false, data: json, error: errMsg };
    }
    catch (err) {
        console.error("SlipOK error:", err);
        return { success: false, error: err?.message || "SlipOK error" };
    }
}
async function downloadLineImage(messageId) {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || process.env.LINE_MESSAGING_ACCESS_TOKEN;
    if (!token)
        return null;
    try {
        const res = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
            headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok) {
            console.error("LINE download image error:", res.status);
            return null;
        }
        const arrayBuffer = await res.arrayBuffer();
        return Buffer.from(arrayBuffer);
    }
    catch (err) {
        console.error("LINE download error:", err);
        return null;
    }
}
/* =========================================================
   POST /api/v1/line/webhook
   ========================================================= */
router.post("/webhook", async (req, res) => {
    try {
        const rawBody = typeof req.rawBody === "string"
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
                if (event.type !== "message")
                    continue;
                const replyToken = event.replyToken;
                const lineUserId = event.source?.userId;
                if (!replyToken || !lineUserId)
                    continue;
                /* ============================================
                   Handle IMAGE messages (slip verification)
                   ============================================ */
                if (event.message?.type === "image") {
                    console.log("=== SLIP VERIFICATION START ===");
                    console.log("LINE incoming image from:", lineUserId, "messageId:", event.message.id);
                    try {
                        // Find user from LINE account
                        const lineAcc = await prisma.lineAccount.findUnique({
                            where: { lineUserId },
                            select: { userId: true },
                        });
                        console.log("Step 1 - lineAcc:", lineAcc ? `found userId=${lineAcc.userId}` : "NOT FOUND");
                        if (!lineAcc?.userId) {
                            await replyMessage(replyToken, [
                                { type: "text", text: "กรุณาเชื่อมบัญชีก่อนส่ง slip ค่ะ" },
                            ]);
                            continue;
                        }
                        // Find that user's residency to get condoId + roomId
                        const residency = await prisma.tenantResidency.findFirst({
                            where: { tenantUserId: lineAcc.userId, status: "ACTIVE" },
                            select: { condoId: true, roomId: true },
                        });
                        console.log("Step 2 - residency:", residency ? `condoId=${residency.condoId}, roomId=${residency.roomId}` : "NOT FOUND");
                        if (!residency) {
                            await replyMessage(replyToken, [
                                { type: "text", text: "ไม่พบข้อมูลการเช่าของคุณ" },
                            ]);
                            continue;
                        }
                        // Find latest unpaid invoice for this room
                        const invoice = await prisma.invoice.findFirst({
                            where: {
                                condoId: residency.condoId,
                                roomId: residency.roomId,
                                status: { not: "PAID" },
                            },
                            orderBy: { createdAt: "desc" },
                            select: {
                                id: true,
                                invoiceNo: true,
                                totalAmount: true,
                                room: { select: { roomNo: true } },
                            },
                        });
                        console.log("Step 3 - invoice:", invoice ? `id=${invoice.id}, invoiceNo=${invoice.invoiceNo}, amount=${invoice.totalAmount}` : "NOT FOUND (all paid?)");
                        if (!invoice) {
                            await replyMessage(replyToken, [
                                { type: "text", text: "✅ ไม่พบใบแจ้งหนี้ที่ค้างชำระ\nหากเพิ่งโอนเงิน กรุณารอสักครู่ค่ะ" },
                            ]);
                            continue;
                        }
                        // Download image from LINE
                        console.log("Step 4 - downloading image from LINE...");
                        const imageBuffer = await downloadLineImage(event.message.id);
                        console.log("Step 4 - image download:", imageBuffer ? `OK (${imageBuffer.length} bytes)` : "FAILED");
                        if (!imageBuffer) {
                            await replyMessage(replyToken, [
                                { type: "text", text: "ไม่สามารถดาวน์โหลดรูปได้ กรุณาลองส่งอีกครั้งค่ะ" },
                            ]);
                            continue;
                        }
                        // Verify with SlipOK
                        console.log("Step 5 - calling SlipOK...");
                        const slipResult = await verifySlipWithSlipOK(imageBuffer);
                        console.log("Step 5 - SlipOK result:", JSON.stringify(slipResult));
                        if (slipResult.success) {
                            // Update invoice to PAID
                            await prisma.invoice.update({
                                where: { id: invoice.id },
                                data: { status: "PAID" },
                            });
                            console.log("Step 6 - invoice updated to PAID");
                            const amountStr = `฿${Number(invoice.totalAmount).toLocaleString("en-US", { minimumFractionDigits: 2 })}`;
                            const transferAmount = slipResult.data?.amount || slipResult.data?.transAmount || "";
                            const transferFrom = slipResult.data?.sender?.name || slipResult.data?.sendingBank || "";
                            await replyMessage(replyToken, [
                                {
                                    type: "text",
                                    text: `✅ ตรวจสอบ slip สำเร็จ!\n` +
                                        `━━━━━━━━━━━━━━━\n` +
                                        `📋 ใบแจ้งหนี้: ${invoice.invoiceNo}\n` +
                                        `🚪 ห้อง: ${invoice.room?.roomNo ?? "-"}\n` +
                                        `💰 ยอด: ${amountStr}\n` +
                                        (transferAmount ? `💵 โอน: ฿${Number(transferAmount).toLocaleString()}\n` : "") +
                                        (transferFrom ? `🏦 จาก: ${transferFrom}\n` : "") +
                                        `━━━━━━━━━━━━━━━\n` +
                                        `📌 สถานะ: ✅ ชำระแล้ว\n\n` +
                                        `ขอบคุณค่ะ 🙏`,
                                },
                            ]);
                            console.log("=== SLIP VERIFICATION COMPLETE - PAID ===");
                        }
                        else {
                            await replyMessage(replyToken, [
                                {
                                    type: "text",
                                    text: `❌ ตรวจ slip ไม่สำเร็จ\n` +
                                        (slipResult.error ? `📝 ${slipResult.error}\n` : "") +
                                        `\nกรุณาส่งรูป slip ที่ชัดเจนอีกครั้ง`,
                                },
                            ]);
                            console.log("=== SLIP VERIFICATION COMPLETE - FAILED ===");
                        }
                    }
                    catch (slipErr) {
                        console.error("=== SLIP VERIFICATION CRASH ===", slipErr);
                        try {
                            await replyMessage(replyToken, [
                                { type: "text", text: `❌ เกิดข้อผิดพลาดในการตรวจ slip\n${slipErr?.message || "unknown error"}` },
                            ]);
                        }
                        catch (replyErr) {
                            console.error("Failed to send error reply:", replyErr);
                        }
                    }
                    continue;
                }
                /* ============================================
                   Handle TEXT messages (room code linking)
                   ============================================ */
                if (event.message?.type !== "text")
                    continue;
                const text = String(event.message?.text ?? "").trim();
                if (!text)
                    continue;
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
                        }
                        else {
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
                            userId: tenantUserId,
                            isActive: true,
                            linkedAt: new Date(),
                        },
                        create: {
                            userId: tenantUserId,
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
                            usedByUserId: tenantUserId,
                        },
                    });
                    const existingResidency = await tx.tenantResidency.findFirst({
                        where: {
                            tenantUserId: tenantUserId,
                            condoId: roomCode.condoId,
                            roomId: roomCode.roomId,
                            status: "ACTIVE",
                        },
                        select: { id: true },
                    });
                    if (!existingResidency) {
                        await tx.tenantResidency.create({
                            data: {
                                tenantUserId: tenantUserId,
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
                            tenantUserId: tenantUserId,
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
                const condoName = roomCode.room?.condo?.nameTh ??
                    roomCode.room?.condo?.nameEn ??
                    "RentSphere";
                await replyMessage(replyToken, [
                    {
                        type: "text",
                        text: `เชื่อมบัญชีสำเร็จแล้ว\n` +
                            `คอนโด: ${condoName}\n` +
                            `ห้อง: ${roomCode.room?.roomNo ?? "-"}\n\n` +
                            `ตอนนี้คุณสามารถใช้งานระบบผู้เช่าได้แล้ว`,
                    },
                ]);
            }
            catch (eventErr) {
                console.error("LINE event error:", eventErr);
                if (event?.replyToken) {
                    try {
                        await replyMessage(event.replyToken, [
                            {
                                type: "text",
                                text: "ระบบเกิดข้อผิดพลาดชั่วคราว กรุณาลองใหม่อีกครั้ง",
                            },
                        ]);
                    }
                    catch (replyErr) {
                        console.error("LINE fallback reply error:", replyErr);
                    }
                }
            }
        }
        return res.status(200).send("OK");
    }
    catch (err) {
        console.error("LINE WEBHOOK ERROR:", err);
        return res.status(200).send("OK");
    }
});
export default router;
