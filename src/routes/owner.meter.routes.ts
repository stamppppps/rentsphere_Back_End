import { Prisma } from "@prisma/client";
import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";

const router = Router();

router.use(authRequired, requireRole(["OWNER"]));

/* =========================
   Helpers
========================= */

function parseMonthInput(raw: any) {
  const s = String(raw ?? "").trim();
  if (!s) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const m = /^(\d{4})-(\d{2})$/.exec(s);
  if (!m) {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
  }

  const year = Number(m[1]);
  const month = Number(m[2]) - 1;

  return new Date(year, month, 1);
}

function calcUtilityCharge(
  units: number,
  billingType: "METER" | "METER_MIN" | "FLAT",
  rate: number,
  minimumCharge?: number | null
) {
  if (billingType === "FLAT") return rate;

  const usage = units * rate;

  if (billingType === "METER_MIN") {
    return Math.max(usage, minimumCharge ?? 0);
  }

  return usage;
}

async function assertOwnerRoomOrThrow(req: any, roomId: string) {
  const ownerId = req.user?.id;

  const room = await prisma.room.findFirst({
    where: {
      id: roomId,
      condo: { ownerUserId: ownerId },
    },
    select: {
      id: true,
      condoId: true,
      roomNo: true,
      floor: true,
    },
  });

  if (!room) {
    const err: any = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  return room;
}

async function assertOwnerCondoOrThrow(ownerId: string, condoId: string) {
  const condo = await prisma.condo.findFirst({
    where: { id: condoId, ownerUserId: ownerId },
    select: { id: true },
  });

  if (!condo) {
    const err: any = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  return condo;
}

/* =========================
   ROOM METER NUMBER
========================= */

router.get("/rooms/:roomId/meter-numbers", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);

    const meter = await prisma.roomMeter.findUnique({
      where: { roomId: room.id },
    });

    res.json(
      meter ?? {
        waterMeterNo: null,
        electricMeterNo: null,
      }
    );
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

router.put("/rooms/:roomId/meter-numbers", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);

    const { waterMeterNo, electricMeterNo } = req.body;

    const saved = await prisma.roomMeter.upsert({
      where: { roomId: room.id },
      update: { waterMeterNo, electricMeterNo },
      create: {
        roomId: room.id,
        waterMeterNo,
        electricMeterNo,
      },
    });

    res.json(saved);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   GET CURRENT METER
========================= */

router.get("/rooms/:roomId/meters", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);

    const month = parseMonthInput(req.query.month);

    let cycle = await prisma.meterCycle.findFirst({
      where: {
        condoId: room.condoId,
        cycleMonth: month,
      },
    });

    if (!cycle) {
      cycle = await prisma.meterCycle.create({
        data: {
          condoId: room.condoId,
          cycleMonth: month,
        },
      });
    }

    const reading = await prisma.meterReading.findUnique({
      where: {
        roomId_cycleId: {
          roomId: room.id,
          cycleId: cycle.id,
        },
      },
    });

    const prev = await prisma.meterReading.findFirst({
      where: {
        roomId: room.id,
        cycle: { cycleMonth: { lt: month } },
      },
      orderBy: {
        cycle: { cycleMonth: "desc" },
      },
    });

    res.json({
      prevWater: prev?.currWater ?? 0,
      prevElectric: prev?.currElectric ?? 0,
      reading,
      cycleId: cycle.id,
    });
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   SAVE METER READING
========================= */

router.post("/rooms/:roomId/meters", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);

    const {
      cycleId,
      currWater,
      currElectric,
    } = req.body;

    const prev = await prisma.meterReading.findFirst({
      where: {
        roomId: room.id,
        cycle: { cycleMonth: { lt: new Date() } },
      },
      orderBy: {
        cycle: { cycleMonth: "desc" },
      },
    });

    const prevWater = Number(prev?.currWater ?? 0);
    const prevElectric = Number(prev?.currElectric ?? 0);

    const waterUnits = currWater - prevWater;
    const electricUnits = currElectric - prevElectric;

    const settings = await prisma.condoUtilitySetting.findMany({
      where: { condoId: room.condoId },
    });

    const waterSetting = settings.find(s => s.utilityType === "WATER");
    const electricSetting = settings.find(s => s.utilityType === "ELECTRIC");

    const waterCharge = waterSetting
      ? calcUtilityCharge(
          waterUnits,
          waterSetting.billingType,
          Number(waterSetting.rate),
          Number(waterSetting.minimumCharge)
        )
      : 0;

    const electricCharge = electricSetting
      ? calcUtilityCharge(
          electricUnits,
          electricSetting.billingType,
          Number(electricSetting.rate),
          Number(electricSetting.minimumCharge)
        )
      : 0;

    const saved = await prisma.meterReading.upsert({
      where: {
        roomId_cycleId: {
          roomId: room.id,
          cycleId,
        },
      },
      update: {
        currWater,
        currElectric,
        prevWater,
        prevElectric,
        waterUnits,
        electricUnits,
        waterCharge,
        electricCharge,
        recordedBy: (req as any).user.id,
        recordedAt: new Date(),
      },
      create: {
        condoId: room.condoId,
        roomId: room.id,
        cycleId,
        prevWater,
        prevElectric,
        currWater,
        currElectric,
        waterUnits,
        electricUnits,
        waterCharge,
        electricCharge,
         recordedBy: (req as any).user.id,
        recordedAt: new Date(),
      },
    });

    res.json(saved);
  } catch (e: any) {
    console.error(e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   HISTORY
========================= */

router.get("/rooms/:roomId/meters/history", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);

    const list = await prisma.meterReading.findMany({
      where: { roomId: room.id },
      include: {
        cycle: true,
      },
      orderBy: {
        cycle: { cycleMonth: "desc" },
      },
    });

    res.json(list);
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   CONDO OVERVIEW
========================= */

router.get("/condos/:condoId/meters", async (req, res) => {
  try {
    const ownerId = (req as any).user.id;

    await assertOwnerCondoOrThrow(ownerId, req.params.condoId);

    const month = parseMonthInput(req.query.month);

    const rooms = await prisma.room.findMany({
      where: { condoId: req.params.condoId },
    });

    const cycle = await prisma.meterCycle.findFirst({
      where: {
        condoId: req.params.condoId,
        cycleMonth: month,
      },
    });

    const readings = await prisma.meterReading.findMany({
      where: {
        cycleId: cycle?.id,
      },
    });

    res.json({
      rooms,
      readings,
    });
  } catch (e: any) {
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

export default router;