import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

/* GET /dorm/status?lineUserId=xxx
   เช็คว่า LINE user ผูกห้องแล้วหรือยัง */
router.get("/status", async (req, res) => {
    try {
        const lineUserId = (req.query.lineUserId as string) || "";
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const lineAccount = await prisma.lineAccount.findUnique({
            where: { lineUserId },
            select: {
                id: true,
                userId: true,
                isActive: true,
            },
        });

        if (!lineAccount) {
            return res.json({ linked: false });
        }

        // เช็คว่ามี residency ที่ active อยู่ไหม
        const residency = await prisma.tenantResidency.findFirst({
            where: {
                tenantUserId: lineAccount.userId,
                status: "ACTIVE",
            },
            select: {
                id: true,
                condoId: true,
                roomId: true,
                condo: { select: { id: true, nameTh: true, nameEn: true } },
                room: { select: { id: true, roomNo: true } },
                tenant: { select: { name: true } },
            },
        });

        if (!residency) {
            return res.json({ linked: false });
        }

        // ดึงชื่อผู้เช่าจาก RoomContract ล่าสุด
        const roomContract = await prisma.roomContract.findFirst({
            where: {
                condoId: residency.condoId,
                roomId: residency.roomId,
            },
            orderBy: { createdAt: "desc" },
            select: { tenantName: true },
        });

        // ดึงข้อมูลห้อง (floor)
        const roomInfo = await prisma.room.findUnique({
            where: { id: residency.roomId },
            select: { floor: true },
        });

        return res.json({
            linked: true,
            condoId: residency.condoId,
            condoName: residency.condo?.nameTh || residency.condo?.nameEn || "",
            roomId: residency.roomId,
            roomNo: residency.room?.roomNo || "",
            floor: roomInfo?.floor ?? null,
            tenantName: roomContract?.tenantName || residency.tenant?.name || "ผู้เช่า",
        });
    } catch (err: any) {
        console.error("dorm/status error:", err);
        return res.status(500).json({ error: "Internal server error" });
    }
});

/* POST /dorm/link-line
   ผูก LINE กับ dorm code */
router.post("/link-line", async (req, res) => {
    try {
        const { lineUserId, code } = req.body as { lineUserId?: string; code?: string };
        if (!lineUserId || !code) {
            return res.status(400).json({ error: "lineUserId and code are required" });
        }

        const normalizedCode = code.trim().toUpperCase().replace(/\s+/g, "");

        const roomCode = await prisma.tenantRoomCode.findFirst({
            where: { code: normalizedCode },
            include: {
                room: {
                    select: {
                        id: true,
                        roomNo: true,
                        floor: true,
                        condoId: true,
                        condo: { select: { id: true, nameTh: true, nameEn: true } },
                    },
                },
                contract: { select: { id: true, tenantUserId: true } },
            },
        });

        if (!roomCode) {
            return res.status(404).json({ error: "ไม่พบรหัสนี้ในระบบ" });
        }
        if (roomCode.status !== "ACTIVE") {
            return res.status(400).json({ error: "รหัสนี้ไม่สามารถใช้งานได้แล้ว" });
        }
        if (roomCode.expiresAt && new Date(roomCode.expiresAt) < new Date()) {
            await prisma.tenantRoomCode.update({
                where: { id: roomCode.id },
                data: { status: "EXPIRED" },
            });
            return res.status(400).json({ error: "รหัสนี้หมดอายุแล้ว" });
        }

        let tenantUserId = roomCode.contract?.tenantUserId ?? null;
        const existingLine = await prisma.lineAccount.findUnique({
            where: { lineUserId },
            select: { id: true, userId: true },
        });

        await prisma.$transaction(async (tx) => {
            if (!tenantUserId) {
                if (existingLine?.userId) {
                    tenantUserId = existingLine.userId;
                } else {
                    const created = await tx.user.create({
                        data: {
                            role: "TENANT",
                            name: `Tenant ${roomCode.room?.roomNo ?? ""}`.trim() || "Tenant",
                            isActive: true,
                            verifyChannel: "PHONE",
                        },
                        select: { id: true },
                    });
                    tenantUserId = created.id;
                }
            }

            await tx.lineAccount.upsert({
                where: { lineUserId },
                update: { userId: tenantUserId!, isActive: true, linkedAt: new Date() },
                create: { userId: tenantUserId!, lineUserId, isActive: true },
            });

            await tx.tenantRoomCode.update({
                where: { id: roomCode.id },
                data: { status: "USED", usedAt: new Date(), usedByUserId: tenantUserId! },
            });

            const existingResidency = await tx.tenantResidency.findFirst({
                where: {
                    tenantUserId: tenantUserId!,
                    condoId: roomCode.condoId,
                    roomId: roomCode.roomId,
                    status: "ACTIVE",
                },
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
        });

        const condoName = roomCode.room?.condo?.nameTh ?? roomCode.room?.condo?.nameEn ?? "RentSphere";

        // ดึงชื่อผู้เช่าจาก RoomContract
        const latestContract = await prisma.roomContract.findFirst({
            where: { condoId: roomCode.condoId, roomId: roomCode.roomId },
            orderBy: { createdAt: "desc" },
            select: { tenantName: true },
        });

        return res.json({
            ok: true,
            condoId: roomCode.condoId,
            condoName,
            roomId: roomCode.roomId,
            roomNo: roomCode.room?.roomNo || "",
            floor: roomCode.room?.floor ?? null,
            tenantName: latestContract?.tenantName || "ผู้เช่า",
        });
    } catch (err: any) {
        console.error("dorm/link-line error:", err);
        return res.status(500).json({ error: err?.message || "Link failed" });
    }
});

export default router;
