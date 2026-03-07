import { Router } from "express";
import { prisma } from "../prisma.js";
import jwt from "jsonwebtoken";
import { cloudinary } from "../utils/cloudinary.js";

const router = Router();

/* =========================================================
   LINE Push Message Helper
   ========================================================= */
async function pushLineMessage(lineUserId: string, text: string) {
    const token = process.env.LINE_MESSAGING_ACCESS_TOKEN || process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) {
        console.warn("LINE_MESSAGING_ACCESS_TOKEN not set, skipping push");
        return;
    }
    try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                to: lineUserId,
                messages: [{ type: "text", text }],
            }),
        });
        if (!res.ok) {
            const errText = await res.text();
            console.error("LINE push error:", errText);
        }
    } catch (err) {
        console.error("LINE push exception:", err);
    }
}

const STATUS_LABEL: Record<string, string> = {
    OPEN: "รอดำเนินการ",
    IN_PROGRESS: "กำลังดำเนินการ",
    WAITING_PARTS: "รออะไหล่",
    DONE: "เสร็จสิ้นแล้ว",
    CANCELLED: "ปฏิเสธ",
};

/* =========================================================
   POST /repair/create
   Tenant สร้างรายงานแจ้งซ่อม (ส่ง JSON)
   ========================================================= */
router.post("/create", async (req, res) => {
    try {
        const { lineUserId, problem_type, description, room, location, images } = req.body as {
            lineUserId?: string;
            problem_type?: string;
            description?: string;
            room?: string;
            location?: string;
            images?: string[]; // base64 data URLs
        };
        if (!problem_type?.trim()) return res.status(400).json({ error: "problem_type is required" });

        let userId = "";

        if (lineUserId) {
            const lineAccount = await prisma.lineAccount.findUnique({
                where: { lineUserId },
                select: { userId: true },
            });
            if (!lineAccount) return res.status(404).json({ error: "LINE account not found" });
            userId = lineAccount.userId;
        } else if (req.headers.authorization) {
            const token = req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
                    userId = decoded.id;
                } catch {
                    return res.status(401).json({ error: "Invalid token" });
                }
            }
        }

        if (!userId) return res.status(400).json({ error: "Authentication required (lineUserId or token)" });

        // หา residency เพื่อเอา condoId + roomId
        const residency = await prisma.tenantResidency.findFirst({
            where: { tenantUserId: userId, status: "ACTIVE" },
            select: { condoId: true, roomId: true },
        });
        if (!residency) return res.status(400).json({ error: "ไม่พบข้อมูลห้องพัก กรุณาลงทะเบียนก่อน" });

        const repair = await prisma.repairRequest.create({
            data: {
                condoId: residency.condoId,
                roomId: residency.roomId,
                tenantUserId: userId,
                createdBy: userId,
                title: problem_type.trim(),
                description: [description?.trim(), location?.trim() ? `สถานที่: ${location.trim()}` : null]
                    .filter(Boolean)
                    .join("\n") || null,
                priority: "NORMAL",
                status: "OPEN",
            },
            select: {
                id: true,
                title: true,
                status: true,
                createdAt: true,
            },
        });

        // Upload images to Cloudinary and save as RepairAttachment
        if (images && Array.isArray(images) && images.length > 0) {
            for (const base64 of images.slice(0, 5)) {
                try {
                    const result = await cloudinary.uploader.upload(base64, {
                        folder: "rentsphere/repairs",
                        resource_type: "image",
                    });
                    await prisma.repairAttachment.create({
                        data: {
                            repairId: repair.id,
                            fileUrl: result.secure_url,
                            fileType: "IMAGE",
                            uploadedBy: userId,
                        },
                    });
                } catch (imgErr) {
                    console.error("Image upload error (non-fatal):", imgErr);
                }
            }
        }

        return res.status(201).json({ ok: true, repair });
    } catch (err: any) {
        console.error("repair/create error:", err);
        return res.status(500).json({ error: err?.message || "สร้างรายการแจ้งซ่อมไม่สำเร็จ" });
    }
});

/* =========================================================
   GET /repair/my?lineUserId=xxx
   Tenant ดูรายการแจ้งซ่อมของตัวเอง
   ========================================================= */
router.get("/my", async (req, res) => {
    try {
        const lineUserId = (req.query.lineUserId as string) || "";
        let userId = "";
        if (lineUserId) {
            const lineAccount = await prisma.lineAccount.findUnique({
                where: { lineUserId },
                select: { userId: true },
            });
            if (!lineAccount) return res.status(404).json({ error: "LINE account not found" });
            userId = lineAccount.userId;
        } else if (req.headers.authorization) {
            const token = req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
                    userId = decoded.id;
                } catch {
                    return res.status(401).json({ error: "Invalid token" });
                }
            }
        }

        if (!userId) return res.status(400).json({ error: "Authentication required" });

        const repairs = await prisma.repairRequest.findMany({
            where: { tenantUserId: userId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                createdAt: true,
                room: { select: { roomNo: true } },
            },
        });

        return res.json({
            items: repairs.map((r) => ({
                id: r.id,
                created_at: r.createdAt.toISOString(),
                problem_type: r.title,
                description: r.description,
                status: r.status,
                location: null,
                room: r.room?.roomNo || null,
                image_url: null,
            })),
        });
    } catch (err: any) {
        console.error("repair/my error:", err);
        return res.status(500).json({ error: err?.message || "โหลดรายการไม่สำเร็จ" });
    }
});

/* =========================================================
   GET /repair/:id
   ดูรายละเอียดแจ้งซ่อม
   ========================================================= */
router.get("/:id", async (req, res) => {
    try {
        const lineUserId = (req.query.lineUserId as string) || "";
        let userId = "";
        if (lineUserId) {
            const lineAccount = await prisma.lineAccount.findUnique({
                where: { lineUserId },
                select: { userId: true },
            });
            if (!lineAccount) return res.status(404).json({ error: "LINE account not found" });
            userId = lineAccount.userId;
        } else if (req.headers.authorization) {
            const token = req.headers.authorization.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
            if (token) {
                try {
                    const decoded = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
                    userId = decoded.id;
                } catch {
                    return res.status(401).json({ error: "Invalid token" });
                }
            }
        }

        if (!userId) return res.status(400).json({ error: "Authentication required" });

        const repair = await prisma.repairRequest.findUnique({
            where: { id: req.params.id },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                createdAt: true,
                updatedAt: true,
                completedAt: true,
                tenantUserId: true,
                condoId: true,
                room: { select: { roomNo: true } },
                condo: { select: { nameTh: true } },
                updates: {
                    orderBy: { createdAt: "desc" },
                    select: {
                        id: true,
                        updateType: true,
                        message: true,
                        oldStatus: true,
                        newStatus: true,
                        createdAt: true,
                    },
                },
                attachments: {
                    select: { id: true, fileUrl: true, createdAt: true },
                    orderBy: { createdAt: "asc" as const },
                },
            },
        });

        if (!repair) return res.status(404).json({ error: "ไม่พบรายการ" });
        if (repair.tenantUserId !== userId) {
            // Check if user is an owner/staff for this condo
            const isStaff = await prisma.staffMembership.findFirst({
                where: { staffUserId: userId, condoId: repair.condoId }
            });
            if (!isStaff) return res.status(403).json({ error: "ไม่มีสิทธิ์เข้าถึงข้อมูล" });
        }

        return res.json({
            id: repair.id,
            problem_type: repair.title,
            description: repair.description,
            status: repair.status,
            priority: repair.priority,
            created_at: repair.createdAt.toISOString(),
            updated_at: repair.updatedAt?.toISOString() || null,
            completed_at: repair.completedAt?.toISOString() || null,
            room: repair.room?.roomNo || null,
            condo: repair.condo?.nameTh || null,
            updates: repair.updates,
            images: (repair as any).attachments?.map((a: any) => a.fileUrl) || [],
        });
    } catch (err: any) {
        console.error("repair/:id error:", err);
        return res.status(500).json({ error: err?.message || "โหลดข้อมูลไม่สำเร็จ" });
    }
});

/* =========================================================
   GET /repair/condo/:condoId
   Owner ดูรายการแจ้งซ่อมทั้งหมดของคอนโด
   ========================================================= */
router.get("/condo/:condoId", async (req, res) => {
    try {
        const repairs = await prisma.repairRequest.findMany({
            where: { condoId: req.params.condoId },
            orderBy: { createdAt: "desc" },
            select: {
                id: true,
                title: true,
                description: true,
                status: true,
                priority: true,
                createdAt: true,
                room: { select: { roomNo: true } },
                tenant: { select: { name: true } },
            },
        });

        return res.json({
            items: repairs.map((r) => ({
                id: r.id,
                problem_type: r.title,
                description: r.description,
                status: r.status,
                priority: r.priority,
                created_at: r.createdAt.toISOString(),
                room: r.room?.roomNo || null,
                tenantName: r.tenant?.name || null,
            })),
        });
    } catch (err: any) {
        console.error("repair/condo error:", err);
        return res.status(500).json({ error: err?.message || "โหลดรายการไม่สำเร็จ" });
    }
});

/* =========================================================
   PATCH /repair/:id/status
   Owner อัพเดตสถานะแจ้งซ่อม
   ========================================================= */
router.patch("/:id/status", async (req, res) => {
    try {
        const { status } = req.body as { status?: string };
        const validStatuses = ["OPEN", "IN_PROGRESS", "WAITING_PARTS", "DONE", "CANCELLED"];
        if (!status || !validStatuses.includes(status)) {
            return res.status(400).json({ error: `status ต้องเป็น: ${validStatuses.join(", ")}` });
        }

        const existing = await prisma.repairRequest.findUnique({
            where: { id: req.params.id },
            select: { id: true, status: true },
        });
        if (!existing) return res.status(404).json({ error: "ไม่พบรายการ" });

        const oldStatus = existing.status;

        const updated = await prisma.repairRequest.update({
            where: { id: req.params.id },
            data: {
                status: status as any,
                completedAt: status === "DONE" ? new Date() : undefined,
            },
            select: { id: true, status: true, updatedAt: true },
        });

        // สร้าง update record
        await prisma.repairUpdate.create({
            data: {
                repairId: req.params.id,
                updateType: "STATUS_CHANGE",
                message: `เปลี่ยนสถานะจาก ${oldStatus} เป็น ${status}`,
                oldStatus: oldStatus as any,
                newStatus: status as any,
            },
        });

        // Send LINE push notification to tenant
        try {
            const repairForNotify = await prisma.repairRequest.findUnique({
                where: { id: req.params.id },
                select: {
                    title: true,
                    tenantUserId: true,
                    room: { select: { roomNo: true } },
                    condo: { select: { nameTh: true } },
                },
            });

            if (repairForNotify?.tenantUserId) {
                const lineAccount = await prisma.lineAccount.findFirst({
                    where: { userId: repairForNotify.tenantUserId, isActive: true },
                    select: { lineUserId: true },
                });

                if (lineAccount?.lineUserId) {
                    const statusText = STATUS_LABEL[status] || status;
                    const msg =
                        `🔔 แจ้งเตือนงานแจ้งซ่อม\n` +
                        `หัวข้อ: ${repairForNotify.title}\n` +
                        `ห้อง: ${repairForNotify.room?.roomNo ?? "-"}\n` +
                        `สถานะใหม่: ${statusText}\n` +
                        `คอนโด: ${repairForNotify.condo?.nameTh ?? "-"}`;
                    await pushLineMessage(lineAccount.lineUserId, msg);
                }
            }
        } catch (lineErr) {
            console.error("LINE notify error (non-fatal):", lineErr);
        }

        return res.json({ ok: true, repair: updated });
    } catch (err: any) {
        console.error("repair/status error:", err);
        return res.status(500).json({ error: err?.message || "อัพเดตสถานะไม่สำเร็จ" });
    }
});

/* =========================================================
   GET /repair/debug/all
   Temporary debug route
   ========================================================= */
router.get("/debug/all", async (req, res) => {
    try {
        const repairs = await prisma.repairRequest.findMany({
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
                id: true,
                title: true,
                status: true,
                condoId: true,
                roomId: true,
                tenantUserId: true,
                createdAt: true,
                condo: { select: { nameTh: true } }
            }
        });
        return res.json({ items: repairs });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message });
    }
});

/* =========================================================
   GET /repair/debug/fix-condo
   Force migrate tenant to the correct owner condo
   ========================================================= */
router.get("/debug/fix-condo", async (req, res) => {
    try {
        const ownerCondoId = "44f345bd-b078-418e-9db4-11ecb2bc2f7c"; // The condo owner is looking at
        const tenantUserId = "a466efc5-9413-4765-9864-eda436097b1b"; // From our previous debug

        // Find a room in the owner condo
        let room = await prisma.room.findFirst({
            where: { condoId: ownerCondoId }
        });

        if (!room) {
            // Create a dummy room if none exists
            room = await prisma.room.create({
                data: {
                    condoId: ownerCondoId,
                    roomNo: "X101",
                    floor: 1,
                    rentPrice: 5000,
                    roomStatus: "NORMAL",
                    occupancyStatus: "VACANT"
                }
            });
        }

        // Update residency
        await prisma.tenantResidency.updateMany({
            where: { tenantUserId },
            data: {
                condoId: ownerCondoId,
                roomId: room.id
            }
        });

        // Update the repair ticket
        await prisma.repairRequest.updateMany({
            where: { tenantUserId },
            data: {
                condoId: ownerCondoId,
                roomId: room.id
            }
        });

        return res.json({ ok: true, message: "Migrated tenant to owner condo", room });
    } catch (err: any) {
        return res.status(500).json({ error: err?.message });
    }
});

/* =========================================================
   GET /repair/debug/condos
   List all condos in DB
   ========================================================= */
router.get("/debug/condos", async (req, res) => {
    try {
        const condos = await prisma.condo.findMany({
            select: { id: true, nameTh: true }
        });
        return res.json(condos);
    } catch (err: any) {
        return res.status(500).json({ error: err?.message });
    }
});

export default router;
