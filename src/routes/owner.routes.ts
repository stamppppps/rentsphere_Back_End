import { Router } from "express";
import { mockAuth } from "../middlewares/mockAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";
import { Prisma } from "@prisma/client";

const router = Router();

// mock auth + role guard
router.use(mockAuth, requireRole(["OWNER"]));

router.get("/me", async (req, res) => {
  res.json({
    message: "OWNER OK",
    user: req.user,
  });
});

/**
 * POST /owner/condos
 * สร้างคอนโด + ผูก ownership ให้ owner คนนี้
 * schema ใหม่: Condo.ownerUserId + condoName
 */
router.post("/condos", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized (missing req.user)" });

    // รับทั้ง condoName และ name เพื่อกัน frontend เก่า
    const {
      condoName,
      name,
      description,
      addressLine1,
      addressLine2,
      province,
      district,
      subdistrict,
      postcode,
      totalFloors,
    } = req.body ?? {};

    const finalName = typeof condoName === "string" ? condoName : typeof name === "string" ? name : null;
    if (!finalName) return res.status(400).json({ error: "condoName (or name) is required (string)" });

    // เช็ค owner มีอยู่จริง (กัน mock header ใส่ id มั่ว)
    const owner = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true } });
    if (!owner) {
      return res.status(400).json({
        error: "Owner user not found in DB. Please use a real user id in x-mock-user header (OWNER:<id>).",
      });
    }

    const condo = await prisma.condo.create({
      data: {
        ownerUserId: ownerId,
        condoName: finalName,
        description: typeof description === "string" ? description : null,

        addressLine1: typeof addressLine1 === "string" ? addressLine1 : null,
        addressLine2: typeof addressLine2 === "string" ? addressLine2 : null,
        province: typeof province === "string" ? province : null,
        district: typeof district === "string" ? district : null,
        subdistrict: typeof subdistrict === "string" ? subdistrict : null,
        postcode: typeof postcode === "string" ? postcode : null,

        totalFloors: typeof totalFloors === "number" ? totalFloors : null,
      },
      include: { owner: true },
    });

    return res.status(201).json(condo);
  } catch (err: any) {
    console.error(err);
    if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate unique value" });
    if (err?.code === "P2003") {
      return res.status(400).json({
        error: "Foreign key constraint failed. Make sure x-mock-user uses an existing User id.",
      });
    }
    return res.status(500).json({ error: "Failed to create condo" });
  }
});

/**
 * GET /owner/condos
 * ดูคอนโดของ owner คนนี้เท่านั้น
 * schema ใหม่: Condo.ownerUserId
 */
router.get("/condos", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condos = await prisma.condo.findMany({
      where: { ownerUserId: ownerId },
      orderBy: { createdAt: "desc" },
      include: { rooms: true },
    });

    return res.json(condos);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch condos" });
  }
});

/**
 * POST /owner/condos/:condoId/rooms
 * เพิ่มห้องให้คอนโด (ต้องเป็นคอนโดของ owner)
 * schema ใหม่: Room.roomNo, Room.floor(Int not null), Room.rentPrice(Decimal)
 */
router.post("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    // รับทั้ง roomNo/number และ rentPrice/price เพื่อกัน frontend เก่า
    const { roomNo, number, floor, rentPrice, price, deposit, size } = req.body ?? {};

    const finalRoomNo = typeof roomNo === "string" ? roomNo : typeof number === "string" ? number : null;
    if (!finalRoomNo) return res.status(400).json({ error: "roomNo (or number) is required (string)" });

    const floorNum = typeof floor === "number" ? floor : Number(floor);
    if (!Number.isFinite(floorNum)) return res.status(400).json({ error: "floor is required (number)" });

    const rpRaw = rentPrice ?? price;
    if (rpRaw === undefined || rpRaw === null) return res.status(400).json({ error: "rentPrice (or price) is required" });
    const rp = new Prisma.Decimal(String(rpRaw));

    // เช็คสิทธิ์: condo นี้เป็นของ owner ไหม
    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const room = await prisma.room.create({
      data: {
        condoId,
        roomNo: finalRoomNo,
        floor: floorNum,
        rentPrice: rp,
        deposit: deposit !== undefined && deposit !== null ? new Prisma.Decimal(String(deposit)) : null,
        size: size !== undefined && size !== null ? new Prisma.Decimal(String(size)) : null,
      },
    });

    return res.status(201).json(room);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Room already exists (unique)" });
    console.error(err);
    return res.status(500).json({ error: "Failed to create room" });
  }
});

/**
 * GET /owner/condos/:condoId/rooms
 * ดูห้องทั้งหมดในคอนโดของ owner
 */
router.get("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const rooms = await prisma.room.findMany({
      where: { condoId },
      orderBy: [{ floor: "asc" }, { roomNo: "asc" }],
    });

    return res.json(rooms);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

export default router;