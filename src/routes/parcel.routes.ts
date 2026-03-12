import { Router } from "express";
import { prisma } from "../prisma.js";
import { cloudinary } from "../utils/cloudinary.js";

const router = Router();

async function pushLineMessage(lineUserId: string, text: string, imageUrl?: string) {
    const token = process.env.LINE_MESSAGING_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) return;
    try {
        const messages: any[] = [{ type: "text", text }];
        // Add image message if URL is provided
        if (imageUrl) {
            messages.push({
                type: "image",
                originalContentUrl: imageUrl,
                previewImageUrl: imageUrl,
            });
        }
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                to: lineUserId,
                messages,
            }),
        });
        if (!res.ok) console.error("LINE push error:", await res.text());
    } catch (err) {
        console.error("LINE push exception:", err);
    }
}

/* =========================================================
   POST /parcel/create
   Owner สร้าง parcel สำหรับ tenant
   ========================================================= */
router.post("/create", async (req, res) => {
    try {
        const { condoId, roomId, trackingNo, carrier, senderName, note, imageBase64 } = req.body as {
            condoId?: string;
            roomId?: string;
            trackingNo?: string;
            carrier?: string;
            senderName?: string;
            note?: string;
            imageBase64?: string; // single base64 image
        };

        if (!condoId) return res.status(400).json({ error: "condoId is required" });
        if (!roomId) return res.status(400).json({ error: "roomId is required" });

        // หา tenant จาก residency ของห้องนี้
        const residency = await prisma.tenantResidency.findFirst({
            where: { condoId, roomId, status: "ACTIVE" },
            select: { tenantUserId: true },
        });

        const parcel = await prisma.parcel.create({
            data: {
                condoId,
                roomId,
                tenantUserId: residency?.tenantUserId || null,
                trackingNo: trackingNo?.trim() || null,
                carrier: carrier?.trim() || null,
                senderName: senderName?.trim() || null,
                pickupNote: note?.trim() || null,
                status: "RECEIVED",
            },
            select: {
                id: true,
                trackingNo: true,
                carrier: true,
                senderName: true,
                status: true,
                createdAt: true,
                room: { select: { roomNo: true } },
            },
        });

        // Upload image to Cloudinary if provided
        let uploadedImageUrl: string | undefined;
        if (imageBase64) {
            try {
                const result = await cloudinary.uploader.upload(imageBase64, {
                    folder: "rentsphere/parcels",
                    resource_type: "image",
                });
                uploadedImageUrl = result.secure_url;
                await prisma.parcelAttachment.create({
                    data: {
                        parcelId: parcel.id,
                        fileUrl: result.secure_url,
                    },
                });
            } catch (imgErr) {
                console.error("Parcel image upload error (non-fatal):", imgErr);
            }
        }

        // Send LINE push notification to tenant
        if (residency?.tenantUserId) {
            try {
                const lineAccount = await prisma.lineAccount.findFirst({
                    where: { userId: residency.tenantUserId, isActive: true },
                    select: { lineUserId: true },
                });
                if (lineAccount?.lineUserId) {
                    const roomInfo = await prisma.room.findUnique({ where: { id: roomId! }, select: { roomNo: true } });
                    const msg =
                        `📦 แจ้งเตือนพัสดุ\n` +
                        `ห้อง: ${roomInfo?.roomNo ?? "-"}\n` +
                        (trackingNo ? `เลขพัสดุ: ${trackingNo}\n` : "") +
                        (note ? `📝 ${note}\n` : "") +
                        `กรุณามารับพัสดุที่ห้องพัก`;
                    await pushLineMessage(lineAccount.lineUserId, msg, uploadedImageUrl);
                }
            } catch (lineErr) {
                console.error("Parcel LINE notify error (non-fatal):", lineErr);
            }
        }

        return res.status(201).json({ ok: true, parcel });
    } catch (err: any) {
        console.error("parcel/create error:", err);
        return res.status(500).json({ error: err?.message || "สร้างพัสดุไม่สำเร็จ" });
    }
});

/* =========================================================
   GET /parcel/room?lineUserId=xxx
   Tenant ดูพัสดุของตัวเอง
   ========================================================= */
router.get("/room", async (req, res) => {
    try {
        const lineUserId = (req.query.lineUserId as string) || "";
        if (!lineUserId) return res.status(400).json({ error: "lineUserId is required" });

        const lineAccount = await prisma.lineAccount.findUnique({
            where: { lineUserId },
            select: { userId: true },
        });
        if (!lineAccount) return res.status(404).json({ error: "LINE account not found" });

        const parcels = await prisma.parcel.findMany({
            where: { tenantUserId: lineAccount.userId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                trackingNo: true,
                carrier: true,
                senderName: true,
                status: true,
                pickupNote: true,
                createdAt: true,
                pickedUpAt: true,
                room: { select: { roomNo: true } },
                tenant: { select: { name: true } },
                attachments: {
                    select: { fileUrl: true },
                    take: 1,
                },
            },
        });

        return res.json({
            items: parcels.map((p) => ({
                id: p.id,
                trackingNo: p.trackingNo,
                carrier: p.carrier,
                senderName: p.senderName,
                status: p.status,
                note: p.pickupNote,
                room: p.room?.roomNo || null,
                tenantName: p.tenant?.name || null,
                createdAt: p.createdAt.toISOString(),
                pickedUpAt: p.pickedUpAt?.toISOString() || null,
                imageUrl: p.attachments?.[0]?.fileUrl || null,
            })),
        });
    } catch (err: any) {
        console.error("parcel/room error:", err);
        return res.status(500).json({ error: err?.message || "โหลดพัสดุไม่สำเร็จ" });
    }
});

/* =========================================================
   GET /parcel/condo/:condoId
   Owner ดูพัสดุทั้งหมดของคอนโด
   ========================================================= */
router.get("/condo/:condoId", async (req, res) => {
    try {
        const parcels = await prisma.parcel.findMany({
            where: { condoId: req.params.condoId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                trackingNo: true,
                carrier: true,
                senderName: true,
                status: true,
                pickupNote: true,
                createdAt: true,
                pickedUpAt: true,
                room: { select: { roomNo: true } },
                tenant: { select: { name: true } },
                attachments: {
                    select: { fileUrl: true },
                    take: 1,
                },
            },
        });

        return res.json({
            items: parcels.map((p) => ({
                id: p.id,
                trackingNo: p.trackingNo,
                carrier: p.carrier,
                senderName: p.senderName,
                status: p.status,
                note: p.pickupNote,
                room: p.room?.roomNo || null,
                tenantName: p.tenant?.name || null,
                createdAt: p.createdAt.toISOString(),
                pickedUpAt: p.pickedUpAt?.toISOString() || null,
                imageUrl: p.attachments?.[0]?.fileUrl || null,
            })),
        });
    } catch (err: any) {
        console.error("parcel/condo error:", err);
        return res.status(500).json({ error: err?.message || "โหลดพัสดุไม่สำเร็จ" });
    }
});

/* =========================================================
   PATCH /parcel/:id/pickup
   อัพเดตสถานะพัสดุเป็น PICKED_UP
   ========================================================= */
router.patch("/:id/pickup", async (req, res) => {
    try {
        const existing = await prisma.parcel.findUnique({
            where: { id: req.params.id },
            select: { id: true, status: true },
        });
        if (!existing) return res.status(404).json({ error: "ไม่พบพัสดุ" });

        const updated = await prisma.parcel.update({
            where: { id: req.params.id },
            data: {
                status: "PICKED_UP",
                pickedUpAt: new Date(),
                pickedUpBy: req.body?.pickedUpBy || null,
            },
            select: { id: true, status: true, pickedUpAt: true },
        });

        return res.json({ ok: true, parcel: updated });
    } catch (err: any) {
        console.error("parcel/pickup error:", err);
        return res.status(500).json({ error: err?.message || "อัพเดตสถานะไม่สำเร็จ" });
    }
});

/* =========================================================
   PATCH /parcel/:id/status
   อัพเดตสถานะพัสดุ (RECEIVED, NOTIFIED, PICKED_UP, RETURNED)
   ========================================================= */
router.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body as { status?: string };
        const validStatuses = ["RECEIVED", "NOTIFIED", "PICKED_UP", "RETURNED"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: `status ต้องเป็น: ${validStatuses.join(", ")}` });
        }

        const existing = await prisma.parcel.findUnique({
            where: { id: req.params.id },
            select: { id: true },
        });
        if (!existing) return res.status(404).json({ error: "ไม่พบพัสดุ" });

        const updated = await prisma.parcel.update({
            where: { id: req.params.id },
            data: {
                status: status as any,
                pickedUpAt: status === "PICKED_UP" ? new Date() : undefined,
            },
            select: { id: true, status: true, updatedAt: true },
        });

        return res.json({ ok: true, parcel: updated });
    } catch (err: any) {
        console.error("parcel/status error:", err);
        return res.status(500).json({ error: err?.message || "อัพเดตสถานะไม่สำเร็จ" });
    }
});

export default router;
