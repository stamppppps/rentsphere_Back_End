import { Router } from "express";
import { mockAuth } from "../middlewares/mockAuth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";


const router = Router();

// mock auth + role guard
router.use(mockAuth, requireRole("OWNER"));

router.get("/me", async (req, res) => {
  res.json({
    message: "OWNER OK",
    user: req.user,
  });
});

/**
 * POST /owner/condos
 * สร้างคอนโด + ผูก ownership ให้ owner คนนี้
 */
router.post("/condos", async (req, res) => {
  try {
    const { name, address, city, province, zipCode } = req.body ?? {};

    if (!name || typeof name !== "string") {
      return res.status(400).json({ error: "name is required (string)" });
    }

   
    const ownerId = req.user?.id;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized (missing req.user)" });
    }

  
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) {
      return res.status(400).json({
        error:
          "Owner user not found in DB. Please use a real user id in x-mock-user header (OWNER:<id>).",
      });
    }

    const condo = await prisma.condo.create({
      data: {
        name,
        type: "CONDO",
        address: typeof address === "string" ? address : null,
        city: typeof city === "string" ? city : null,
        province: typeof province === "string" ? province : null,
       

       
        owners: {
          create: {
            ownerId: ownerId,
          },
        },
      },
      include: { owners: true },
    });

    return res.status(201).json(condo);
  } catch (err: any) {
    console.error(err);

  
    if (err?.code === "P2003") {
      return res.status(400).json({
        error:
          "Foreign key constraint failed (ownerId not found). Make sure x-mock-user uses an existing User id.",
      });
    }

    return res.status(500).json({ error: "Failed to create condo" });
  }
});


/**
 * GET /owner/condos
 * ดูคอนโดของ owner คนนี้เท่านั้น
 */
router.get("/condos", async (req, res) => {
  try {
    const ownerId = req.user!.id;

    const condos = await prisma.condo.findMany({
    where: { owners: { some: { ownerId } } }, 
    orderBy: { createdAt: "desc" },
    include: { rooms: true },
});


    res.json(condos);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch condos" });
  }
});

/**
 * POST /owner/condos/:condoId/rooms
 * เพิ่มห้องให้คอนโด (ต้องเป็นคอนโดของ owner)
 */
router.post("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = req.user!.id;
    const condoId = req.params.condoId;

    const { number, floor, type, price } = req.body ?? {};
    if (!number || typeof number !== "string") {
      return res.status(400).json({ error: "number is required (string)" });
    }
    // เช็คสิทธิ์: condo นี้เป็นของ owner ไหม
    const canAccess = await prisma.ownerCondo.findFirst({
    where: { condoId, ownerId },
    select: { id: true },
});


    if (!canAccess) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const room = await prisma.room.create({
      data: {
        condoId,
        number,
        floor: typeof floor === "number" ? floor : null,
        type: typeof type === "string" ? type : null,
        price: typeof price === "number" ? price : null,
      },
    });

    res.status(201).json(room);
  } catch (err: any) {
    // ห้องซ้ำในคอนโดเดียวกัน
    if (err?.code === "P2002") return res.status(409).json({ error: "Room number already exists" });
    console.error(err);
    res.status(500).json({ error: "Failed to create room" });
  }
});

/**
 * GET /owner/condos/:condoId/rooms
 * ดูห้องทั้งหมดในคอนโดของ owner
 */
router.get("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = req.user!.id;
    const condoId = req.params.condoId;

    const canAccess = await prisma.ownerCondo.findFirst({
    where: { condoId, ownerId },
    select: { id: true },
});


    if (!canAccess) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const rooms = await prisma.room.findMany({
      where: { condoId },
      orderBy: [{ floor: "asc" }, { number: "asc" }],
    });

    res.json(rooms);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

export default router;
