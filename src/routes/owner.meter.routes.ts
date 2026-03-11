import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";

const router = Router();

router.use(authRequired, requireRole(["OWNER"]));

let meterChargeColumnsAvailable: boolean | null = null;
let utilityMinimumChargeColumnAvailable: boolean | null = null;

async function hasMeterChargeColumns() {
  if (meterChargeColumnsAvailable !== null) {
    return meterChargeColumnsAvailable;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'MeterReading'
      AND column_name IN ('waterCharge', 'electricCharge')
  `;

  meterChargeColumnsAvailable = columns.length === 2;
  return meterChargeColumnsAvailable;
}

async function hasUtilityMinimumChargeColumn() {
  if (utilityMinimumChargeColumnAvailable !== null) {
    return utilityMinimumChargeColumnAvailable;
  }

  const columns = await prisma.$queryRaw<Array<{ column_name: string }>>`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'CondoUtilitySetting'
      AND column_name = 'minimumCharge'
  `;

  utilityMinimumChargeColumnAvailable = columns.length === 1;
  return utilityMinimumChargeColumnAvailable;
}

function meterReadingSelect(withCharges: boolean) {
  return {
    id: true,
    condoId: true,
    roomId: true,
    cycleId: true,
    prevWater: true,
    currWater: true,
    prevElectric: true,
    currElectric: true,
    waterUnits: true,
    electricUnits: true,
    status: true,
    recordedAt: true,
    note: true,
    ...(withCharges
      ? {
          waterCharge: true,
          electricCharge: true,
        }
      : {}),
  };
}

function condoUtilitySettingSelect(withMinimumCharge: boolean) {
  return {
    utilityType: true,
    billingType: true,
    rate: true,
    ...(withMinimumCharge ? { minimumCharge: true } : {}),
  };
}

/* =========================
   Helpers
========================= */

function parseMonthInput(raw: any) {
  const s = String(raw ?? "").trim();

  let year: number;
  let month: number;

  if (!s) {
    const now = new Date();
    year = now.getUTCFullYear();
    month = now.getUTCMonth();
  } else {
    const m = /^(\d{4})-(\d{2})$/.exec(s);
    if (!m) {
      const now = new Date();
      year = now.getUTCFullYear();
      month = now.getUTCMonth();
    } else {
      year = Number(m[1]);
      month = Number(m[2]) - 1;
    }
  }

  return new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
}

function getMonthRange(date: Date) {
  const start = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1, 0, 0, 0, 0)
  );
  const next = new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1, 0, 0, 0, 0)
  );
  return { start, next };
}

function toSafeNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function normalizeOptionalText(value: unknown) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  return s ? s : null;
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

function mapReadingNumbers<T extends Record<string, any>>(r: T) {
  return {
    ...r,
    prevWater: Number(r.prevWater ?? 0),
    currWater: Number(r.currWater ?? 0),
    prevElectric: Number(r.prevElectric ?? 0),
    currElectric: Number(r.currElectric ?? 0),
    waterUnits: Number(r.waterUnits ?? 0),
    electricUnits: Number(r.electricUnits ?? 0),
    waterCharge: Number(r.waterCharge ?? 0),
    electricCharge: Number(r.electricCharge ?? 0),
  };
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
      occupancyStatus: true,
      roomStatus: true,
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

async function findOrCreateCycleForMonth(condoId: string, targetMonth: Date) {
  const { start, next } = getMonthRange(targetMonth);

  let cycle = await prisma.meterCycle.findFirst({
    where: {
      condoId,
      cycleMonth: {
        gte: start,
        lt: next,
      },
    },
    orderBy: {
      cycleMonth: "asc",
    },
  });

  if (!cycle) {
    cycle = await prisma.meterCycle.create({
      data: {
        condoId,
        cycleMonth: start,
        openedAt: new Date(),
      },
    });
  }

  return cycle;
}

async function findPreviousReading(roomId: string, currentCycleMonth: Date) {
  const withCharges = await hasMeterChargeColumns();
  return prisma.meterReading.findFirst({
    where: {
      roomId,
      cycle: {
        cycleMonth: {
          lt: currentCycleMonth,
        },
      },
    },
    orderBy: {
      cycle: {
        cycleMonth: "desc",
      },
    },
    select: {
      currWater: true,
      currElectric: true,
      ...(withCharges
        ? {
            waterCharge: true,
            electricCharge: true,
          }
        : {}),
    },
  });
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
    console.error("GET METER NUMBERS ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

router.put("/rooms/:roomId/meter-numbers", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);

    const { waterMeterNo, electricMeterNo } = req.body;

    const saved = await prisma.roomMeter.upsert({
      where: { roomId: room.id },
      update: {
        waterMeterNo: normalizeOptionalText(waterMeterNo),
        electricMeterNo: normalizeOptionalText(electricMeterNo),
      },
      create: {
        roomId: room.id,
        waterMeterNo: normalizeOptionalText(waterMeterNo),
        electricMeterNo: normalizeOptionalText(electricMeterNo),
      },
    });

    res.json(saved);
  } catch (e: any) {
    console.error("SAVE METER NUMBERS ERROR:", e);
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
    const cycle = await findOrCreateCycleForMonth(room.condoId, month);
    const withCharges = await hasMeterChargeColumns();

    const reading = await prisma.meterReading.findUnique({
      where: {
        roomId_cycleId: {
          roomId: room.id,
          cycleId: cycle.id,
        },
      },
      select: meterReadingSelect(withCharges),
    });

    const prevReading = await findPreviousReading(room.id, cycle.cycleMonth);
    const meter = await prisma.roomMeter.findUnique({
      where: { roomId: room.id },
    });

    res.json({
      month: cycle.cycleMonth,
      cycleId: cycle.id,
      cycleStatus: cycle.status,
      room: {
        id: room.id,
        roomNo: room.roomNo,
        floor: room.floor,
        occupancyStatus: room.occupancyStatus,
        roomStatus: room.roomStatus,
      },
      meter: meter ?? {
        waterMeterNo: null,
        electricMeterNo: null,
      },
      prevWater: Number(prevReading?.currWater ?? 0),
      prevElectric: Number(prevReading?.currElectric ?? 0),
      reading: reading
        ? {
            id: reading.id,
            currWater: Number(reading.currWater ?? 0),
            currElectric: Number(reading.currElectric ?? 0),
            waterUnits: Number(reading.waterUnits ?? 0),
            electricUnits: Number(reading.electricUnits ?? 0),
            waterCharge: Number(reading.waterCharge ?? 0),
            electricCharge: Number(reading.electricCharge ?? 0),
            status: reading.status,
            recordedAt: reading.recordedAt,
            note: reading.note,
          }
        : null,
    });
  } catch (e: any) {
    console.error("GET CURRENT METER ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   SAVE METER READING
========================= */

router.post("/rooms/:roomId/meters", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);
    const withCharges = await hasMeterChargeColumns();
    const withMinimumCharge = await hasUtilityMinimumChargeColumn();

    const { cycleId, month, currWater, currElectric, note } = req.body;

    let cycle = null;

    if (cycleId) {
      cycle = await prisma.meterCycle.findFirst({
        where: {
          id: String(cycleId),
          condoId: room.condoId,
        },
      });
    } else {
      const targetMonth = parseMonthInput(month);
      cycle = await findOrCreateCycleForMonth(room.condoId, targetMonth);
    }

    if (!cycle) {
      return res.status(400).json({ error: "cycleId or month is required" });
    }

    if (cycle.status === "CLOSED") {
      return res.status(400).json({ error: "รอบบิลนี้ถูกปิดแล้ว" });
    }

    const safeCurrWater = Math.max(0, toSafeNumber(currWater));
    const safeCurrElectric = Math.max(0, toSafeNumber(currElectric));
    const safeNote = normalizeOptionalText(note);

    const saved = await prisma.$transaction(async (tx) => {
      const prevReading = await tx.meterReading.findFirst({
        where: {
          roomId: room.id,
          cycle: {
            cycleMonth: {
              lt: cycle.cycleMonth,
            },
          },
        },
        orderBy: {
          cycle: {
            cycleMonth: "desc",
          },
        },
        select: {
          currWater: true,
          currElectric: true,
        },
      });

      const prevWater = Number(prevReading?.currWater ?? 0);
      const prevElectric = Number(prevReading?.currElectric ?? 0);

      if (safeCurrWater < prevWater) {
        const err: any = new Error("เลขมิเตอร์น้ำต้องไม่น้อยกว่าครั้งก่อน");
        err.status = 400;
        throw err;
      }

      if (safeCurrElectric < prevElectric) {
        const err: any = new Error("เลขมิเตอร์ไฟต้องไม่น้อยกว่าครั้งก่อน");
        err.status = 400;
        throw err;
      }

      const waterUnits = Math.max(0, safeCurrWater - prevWater);
      const electricUnits = Math.max(0, safeCurrElectric - prevElectric);

      const settings = await tx.condoUtilitySetting.findMany({
        where: { condoId: room.condoId },
        select: condoUtilitySettingSelect(withMinimumCharge),
      });

      const waterSetting = settings.find((s) => s.utilityType === "WATER");
      const electricSetting = settings.find((s) => s.utilityType === "ELECTRIC");

      const waterCharge = waterSetting
        ? calcUtilityCharge(
            waterUnits,
            waterSetting.billingType,
            Number(waterSetting.rate),
            withMinimumCharge
              ? waterSetting.minimumCharge == null
                ? null
                : Number(waterSetting.minimumCharge)
              : null
          )
        : 0;

      const electricCharge = electricSetting
        ? calcUtilityCharge(
            electricUnits,
            electricSetting.billingType,
            Number(electricSetting.rate),
            withMinimumCharge
              ? electricSetting.minimumCharge == null
                ? null
                : Number(electricSetting.minimumCharge)
              : null
          )
        : 0;

      return tx.meterReading.upsert({
        where: {
          roomId_cycleId: {
            roomId: room.id,
            cycleId: cycle.id,
          },
        },
        update: {
          prevWater,
          prevElectric,
          currWater: safeCurrWater,
          currElectric: safeCurrElectric,
          waterUnits,
          electricUnits,
          ...(withCharges
            ? {
                waterCharge,
                electricCharge,
              }
            : {}),
          note: safeNote,
          status: "SUBMITTED",
          recordedBy: req.user?.id,
          recordedAt: new Date(),
        },
        create: {
          condoId: room.condoId,
          roomId: room.id,
          cycleId: cycle.id,
          prevWater,
          prevElectric,
          currWater: safeCurrWater,
          currElectric: safeCurrElectric,
          waterUnits,
          electricUnits,
          ...(withCharges
            ? {
                waterCharge,
                electricCharge,
              }
            : {}),
          note: safeNote,
          status: "SUBMITTED",
          recordedBy: req.user?.id,
          recordedAt: new Date(),
        },
        select: meterReadingSelect(withCharges),
      });
    });

    res.json({
      id: saved.id,
      cycleId: saved.cycleId,
      roomId: saved.roomId,
      prevWater: Number(saved.prevWater ?? 0),
      currWater: Number(saved.currWater ?? 0),
      prevElectric: Number(saved.prevElectric ?? 0),
      currElectric: Number(saved.currElectric ?? 0),
      waterUnits: Number(saved.waterUnits ?? 0),
      electricUnits: Number(saved.electricUnits ?? 0),
      waterCharge: Number(saved.waterCharge ?? 0),
      electricCharge: Number(saved.electricCharge ?? 0),
      status: saved.status,
      recordedAt: saved.recordedAt,
      note: saved.note,
    });
  } catch (e: any) {
    console.error("SAVE METER ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   HISTORY
========================= */

router.get("/rooms/:roomId/meters/history", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, req.params.roomId);
    const withCharges = await hasMeterChargeColumns();

    const list = await prisma.meterReading.findMany({
      where: { roomId: room.id },
      select: {
        ...meterReadingSelect(withCharges),
        cycle: true,
      },
      orderBy: {
        cycle: { cycleMonth: "desc" },
      },
    });

    res.json(list.map((item) => mapReadingNumbers(item)));
  } catch (e: any) {
    console.error("ROOM HISTORY ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   CONDO OVERVIEW
========================= */

router.get("/condos/:condoId/meters", async (req, res) => {
  try {
    const ownerId = req.user?.id;

    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    await assertOwnerCondoOrThrow(ownerId, req.params.condoId);

    const month = parseMonthInput(req.query.month);
    const cycle = await findOrCreateCycleForMonth(req.params.condoId, month);
    const withCharges = await hasMeterChargeColumns();

    const rooms = await prisma.room.findMany({
      where: { condoId: req.params.condoId },
      orderBy: { roomNo: "asc" },
      include: {
        meter: true,
      },
    });

    const readings = await prisma.meterReading.findMany({
      where: {
        cycleId: cycle.id,
      },
      select: meterReadingSelect(withCharges),
      orderBy: {
        roomId: "asc",
      },
    });

    res.json({
      cycleId: cycle.id,
      cycleMonth: cycle.cycleMonth,
      status: cycle.status,
      rooms,
      readings: readings.map((r) => mapReadingNumbers(r)),
    });
  } catch (e: any) {
    console.error("CONDO OVERVIEW ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

export default router;
