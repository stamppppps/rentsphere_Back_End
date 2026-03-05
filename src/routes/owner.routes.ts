// owner.routes.ts
import { Router } from "express";
import { Prisma } from "@prisma/client";
import bcrypt from "bcrypt";
import crypto from "crypto";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { uploadMemory } from "../middlewares/uploadMemory.js";
import { prisma } from "../prisma.js";
import { cloudinary } from "../utils/cloudinary.js";
import { sendStaffInviteEmail } from "../utils/mailer.js";

const router = Router();

router.use(authRequired, requireRole(["OWNER"]));

/* =========================
   Permission helpers
   ========================= */
const DEFAULT_PERMISSION_MODULES = [
  "DASHBOARD",
  "ROOMS",
  "BILLING",
  "PAYMENT",
  "PARCEL",
  "REPAIR",
  "FACILITY",
  "ANNOUNCE",
  "CHAT",
  "STAFF",
  "TENANT",
] as const;

type PermissionModuleStr = (typeof DEFAULT_PERMISSION_MODULES)[number];

async function ensurePermissionCatalog(modules: PermissionModuleStr[]) {
  await Promise.all(
    modules.map((m) =>
      prisma.permissionCatalog.upsert({
        where: { code: `${m}_ACCESS` },
        create: {
          code: `${m}_ACCESS`,
          nameTh: `${m} access`,
          module: m as any,
          isActive: true,
        },
        update: { isActive: true, module: m as any },
      })
    )
  );
}

async function assertOwnerCondoOrThrow(ownerId: string, condoId: string) {
  const condo = await prisma.condo.findFirst({
    where: { id: condoId, ownerUserId: ownerId },
    select: { id: true, nameTh: true },
  });
  if (!condo) {
    const err: any = new Error("Forbidden (not your condo)");
    err.status = 403;
    throw err;
  }
  return condo;
}

function genTempPassword() {
  return crypto.randomBytes(8).toString("base64url").slice(0, 10);
}

async function getAllowedModulesForMembership(membershipId: string) {
  const overrides = await prisma.staffPermissionOverride.findMany({
    where: { membershipId, allowed: true },
    select: { permission: { select: { module: true } } },
  });
  return overrides.map((x) => x.permission.module);
}

async function replaceMembershipOverrides(membershipId: string, modules: PermissionModuleStr[]) {
  await prisma.staffPermissionOverride.deleteMany({ where: { membershipId } });
  if (modules.length === 0) return;

  const perms = await prisma.permissionCatalog.findMany({
    where: { code: { in: modules.map((m) => `${m}_ACCESS`) } },
    select: { id: true, code: true },
  });
  const map = new Map(perms.map((p) => [p.code, p.id]));

  await prisma.staffPermissionOverride.createMany({
    data: modules
      .map((m) => ({
        permissionId: map.get(`${m}_ACCESS`),
        membershipId,
        allowed: true,
      }))
      .filter(
        (x): x is { permissionId: string; membershipId: string; allowed: boolean } =>
          Boolean(x.permissionId)
      ),
  });
}

router.get("/me", async (req, res) => {
  res.json({ message: "OWNER OK", user: (req as any).user });
});

/* =========================
   Bank mapping (TH)
   ========================= */
const BANK_NAME_MAP: Record<string, string> = {
  PROMPTPAY: "พร้อมเพย์ (PromptPay)",
  BBL: "ธนาคารกรุงเทพ (Bangkok Bank)",
  KBANK: "ธนาคารกสิกรไทย (Kasikorn Bank)",
  SCB: "ธนาคารไทยพาณิชย์ (SCB)",
  KTB: "ธนาคารกรุงไทย (Krungthai Bank)",
  BAY: "ธนาคารกรุงศรีอยุธยา (Krungsri Bank)",
  TTB: "ธนาคารทหารไทยธนชาต (TTB)",
  CIMB: "ธนาคารซีไอเอ็มบีไทย (CIMB Thai)",
  UOB: "ธนาคารยูโอบี (UOB)",
  KKP: "ธนาคารเกียรตินาคินภัทร (KKP)",
  TISCO: "ธนาคารทิสโก้ (TISCO)",
  LH: "ธนาคารแลนด์ แอนด์ เฮ้าส์ (LH Bank)",
  ICBC: "ธนาคารไอซีบีซี (ICBC Thai)",
  BAAC: "ธนาคารเพื่อการเกษตรและสหกรณ์การเกษตร (ธ.ก.ส.)",
  GSB: "ธนาคารออมสิน (GSB)",
  GHB: "ธนาคารอาคารสงเคราะห์ (GHB)",
  EXIM: "ธนาคารเพื่อการส่งออกและนำเข้าแห่งประเทศไทย (EXIM)",
  IBANK: "ธนาคารอิสลามแห่งประเทศไทย (IBank)",
};

/* =========================
   Helpers
   ========================= */
function asTrimmedString(v: any): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length ? s : null;
}

function asOptionalInt(v: any): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.trunc(n);
}

function asRequiredInt(v: any): number | null {
  const n = asOptionalInt(v);
  return n === null ? null : n;
}

function asOptionalMoneyNumber(v: any): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const raw = String(v).replace(/,/g, "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asRequiredTrimmedString(v: any): string | null {
  const s = asTrimmedString(v);
  return s ? s : null;
}

function asBankCode(v: any): string | null {
  const s = asTrimmedString(v);
  if (!s) return null;
  return s.toUpperCase();
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

/* =========================
   Guard: check owner owns condo
   ========================= */
async function assertOwnerCondo(ownerId: string, condoId: string) {
  const condo = await prisma.condo.findFirst({
    where: { id: condoId, ownerUserId: ownerId },
    select: { id: true, nameTh: true },
  });
  return condo;
}

/* =========================
   Guard: check owner owns room (via condo)
   ========================= */
async function assertOwnerRoomOrThrow(req: any, roomId: string) {
  const ownerId = req.user?.id;
  if (!ownerId) {
    const err: any = new Error("Unauthorized");
    err.status = 401;
    throw err;
  }

  const room = await prisma.room.findFirst({
    where: { id: roomId, condo: { ownerUserId: ownerId } },
    select: { id: true, condoId: true, roomNo: true, floor: true },
  });

  if (!room) {
    const err: any = new Error("Forbidden (not your room)");
    err.status = 403;
    throw err;
  }
  return room;
}

function startOfMonth(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

async function getOrCreateCurrentCycle(condoId: string, openedBy?: string | null) {
  const cycleMonth = startOfMonth(new Date());

  const cycle = await prisma.meterCycle.upsert({
    where: { condoId_cycleMonth: { condoId, cycleMonth } },
    update: {},
    create: {
      condoId,
      cycleMonth,
      status: "OPEN",
      openedBy: openedBy ?? null,
    },
  });

  return cycle;
}

/* =========================
   POST /owner/condos/:condoId/logo
   ========================= */
router.post("/condos/:condoId/logo", uploadMemory.single("logo"), async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    if (!req.file) return res.status(400).json({ error: "Missing file field 'logo'" });
    const file = req.file;

    const uploadResult = await new Promise<{ secure_url?: string }>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: `rentsphere/condos/${condoId}`,
          resource_type: "image",
          overwrite: true,
          public_id: "logo",
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result as any);
        }
      );
      stream.end(file.buffer);
    });

    const fileUrl = String(uploadResult?.secure_url ?? "");
    if (!fileUrl) return res.status(500).json({ error: "Cloudinary upload failed (no url)" });

    await prisma.$transaction(async (tx) => {
      await tx.condoAsset.updateMany({
        where: { condoId, assetType: "LOGO", isPrimary: true },
        data: { isPrimary: false },
      });

      await tx.condoAsset.create({
        data: {
          condoId,
          assetType: "LOGO",
          fileUrl,
          fileName: file.originalname,
          mimeType: file.mimetype,
          sizeBytes: BigInt(file.size),
          isPrimary: true,
          uploadedBy: ownerId,
        },
      });
    });

    return res.json({ ok: true, logoUrl: fileUrl });
  } catch (err: any) {
    console.error(err);
    return res.status(500).json({ error: err?.message ?? "Upload failed" });
  }
});

/* =========================
   POST /owner/condos
   ========================= */
router.post("/condos", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const body = req.body ?? {};

    const nameTh = asTrimmedString(body.nameTh);
    const addressTh = asTrimmedString(body.addressTh);

    const legacyName = asTrimmedString(body.condoName) ?? asTrimmedString(body.name);
    const legacyAddr = asTrimmedString(body.addressLine1) ?? asTrimmedString(body.addressTh);

    const finalNameTh = nameTh ?? legacyName;
    const finalAddressTh = addressTh ?? legacyAddr;

    if (!finalNameTh) return res.status(400).json({ error: "nameTh is required" });
    if (!finalAddressTh) return res.status(400).json({ error: "addressTh is required" });

    const nameEn = asTrimmedString(body.nameEn);
    const addressEn = asTrimmedString(body.addressEn);
    const phoneNumber = asTrimmedString(body.phoneNumber);
    const taxId = asTrimmedString(body.taxId);

    const billing = body.billing ?? {};
    const dueDayRaw = billing.dueDay ?? body.paymentDueDate;

    let dueDay: number | null = null;
    if (typeof dueDayRaw === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dueDayRaw.trim())) {
      dueDay = Number(dueDayRaw.trim().slice(8, 10));
    } else {
      dueDay = asOptionalInt(dueDayRaw);
    }

    if (!dueDay || dueDay < 1 || dueDay > 28) {
      return res.status(400).json({ error: "billing.dueDay must be 1-28" });
    }

    const acceptFine = Boolean(billing.acceptFine ?? body.acceptFine ?? false);

    const fineRaw = billing.finePerDay ?? body.fineAmount;
    const finePerDay = acceptFine ? asOptionalMoneyNumber(fineRaw) : null;

    if (acceptFine && (finePerDay === null || finePerDay < 0)) {
      return res.status(400).json({
        error: "billing.finePerDay is required (>=0) when acceptFine=true",
      });
    }

    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) return res.status(400).json({ error: "Owner user not found in DB" });

    const created = await prisma.$transaction(async (tx) => {
      const condo = await tx.condo.create({
        data: {
          ownerUserId: ownerId,
          nameTh: finalNameTh,
          addressTh: finalAddressTh,
          nameEn,
          addressEn,
          phoneNumber,
          taxId,
        },
      });

      await tx.condoBillingSetting.create({
        data: {
          condoId: condo.id,
          dueDay,
          acceptFine,
          finePerDay: acceptFine ? (finePerDay ?? 0) : 0,
        },
      });

      return tx.condo.findUnique({
        where: { id: condo.id },
        include: {
          billingSetting: true,
          owner: { select: { id: true, email: true, phone: true, name: true, role: true } },
        },
      });
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error("CREATE CONDO ERROR:", err);

    if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate unique value" });
    if (err?.code === "P2003") return res.status(400).json({ error: "Foreign key constraint failed" });

    return res.status(500).json({
      error: "Failed to create condo",
      detail: String(err?.message ?? err),
    });
  }
});

/* =========================
   GET /owner/condos
   ========================= */
router.get("/condos", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condos = await prisma.condo.findMany({
      where: { ownerUserId: ownerId },
      orderBy: { createdAt: "desc" },
      include: {
        billingSetting: true,
        rooms: true,
      },
    });

    return res.json(condos);
  } catch (err: any) {
    console.error("LIST CONDOS ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch condos" });
  }
});

/* =========================
   GET /owner/condos/:condoId
   ========================= */
router.get("/condos/:condoId", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      include: { billingSetting: true },
    });

    if (!condo) return res.status(404).json({ error: "Condo not found" });

    return res.json(condo);
  } catch (err: any) {
    console.error("GET CONDO ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch condo" });
  }
});

// =========================
// GET /owner/condos/:condoId/dashboard
// =========================
router.get("/condos/:condoId/dashboard", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: {
        id: true,
        nameTh: true,
        nameEn: true,
        rooms: {
          select: {
            id: true,
            isActive: true,
            occupancyStatus: true,
            rentPrice: true,
          },
        },
      },
    });

    if (!condo) return res.status(404).json({ error: "Condo not found" });

    const rooms = condo.rooms ?? [];

    const roomsTotal = rooms.length;
    const roomsActive = rooms.filter((r) => r.isActive).length;

    const occupiedRooms = rooms.filter((r) => r.isActive && r.occupancyStatus === "OCCUPIED").length;
    const vacantRooms = rooms.filter((r) => r.isActive && r.occupancyStatus === "VACANT").length;

    const activeRoomsForAvg = rooms.filter((r) => r.isActive);
    const avgRentPrice =
      activeRoomsForAvg.length === 0
        ? 0
        : Math.round(activeRoomsForAvg.reduce((sum, r) => sum + Number(r.rentPrice ?? 0), 0) / activeRoomsForAvg.length);

    return res.json({
      summary: {
        condoId: condo.id,
        condoName: condo.nameTh ?? condo.nameEn ?? "—",
        roomsTotal,
        roomsActive,
        occupiedRooms,
        vacantRooms,
        avgRentPrice,
      },
    });
  } catch (err: any) {
    console.error("GET DASHBOARD ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

/* =========================
   (Step4) Floor/Room config
   ========================= */
router.get("/condos/:condoId/floor-config", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const floors = await prisma.condoFloor.findMany({
      where: { condoId },
      orderBy: { floorNo: "asc" },
      select: { floorNo: true, roomsCount: true },
    });

    if (!floors.length) return res.json({ floorCount: 0, roomsPerFloor: [], totalRooms: 0 });

    const roomsPerFloor = floors.map((f) => Number(f.roomsCount ?? 1));
    const floorCount = roomsPerFloor.length;
    const totalRooms = roomsPerFloor.reduce((a, b) => a + b, 0);

    return res.json({ floorCount, roomsPerFloor, totalRooms });
  } catch (err: any) {
    console.error("GET FLOOR CONFIG ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch floor config" });
  }
});

router.put("/condos/:condoId/floor-config", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const floorCount = Number(req.body?.floorCount);
    const roomsPerFloorRaw = req.body?.roomsPerFloor;

    if (!Number.isInteger(floorCount) || floorCount < 1 || floorCount > 100) {
      return res.status(400).json({ error: "floorCount must be 1-100" });
    }
    if (!Array.isArray(roomsPerFloorRaw) || roomsPerFloorRaw.length !== floorCount) {
      return res.status(400).json({ error: "roomsPerFloor length must equal floorCount" });
    }

    const roomsPerFloor: number[] = roomsPerFloorRaw.map((x: any) => Number(x));
    for (const n of roomsPerFloor) {
      if (!Number.isInteger(n) || n < 1 || n > 50) {
        return res.status(400).json({ error: "each roomsPerFloor must be 1-50" });
      }
    }

    const saved = await prisma.$transaction(async (tx) => {
      await tx.condoFloor.deleteMany({
        where: { condoId, floorNo: { gt: floorCount } },
      });

      for (let i = 0; i < floorCount; i++) {
        const floorNo = i + 1;
        const roomsCount = roomsPerFloor[i];

        await tx.condoFloor.upsert({
          where: { condoId_floorNo: { condoId, floorNo } },
          create: { condoId, floorNo, roomsCount, label: `ชั้น ${floorNo}` },
          update: { roomsCount, label: `ชั้น ${floorNo}` },
        });
      }

      const floors = await tx.condoFloor.findMany({
        where: { condoId },
        orderBy: { floorNo: "asc" },
        select: { roomsCount: true },
      });

      const outRooms = floors.map((f) => Number(f.roomsCount ?? 1));
      const outFloorCount = outRooms.length;
      const totalRooms = outRooms.reduce((a, b) => a + b, 0);

      return { floorCount: outFloorCount, roomsPerFloor: outRooms, totalRooms };
    });

    return res.json(saved);
  } catch (err: any) {
    console.error("SAVE FLOOR CONFIG ERROR:", err);
    return res.status(500).json({ error: "Failed to save floor config" });
  }
});

/* =========================================================
   ✅ Meter Numbers (RoomMeter)  +  Meter Reading (Monthly)
   ========================================================= */

// GET /owner/rooms/:roomId/meter-numbers
router.get("/rooms/:roomId/meter-numbers", async (req, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const meter = await prisma.roomMeter.findUnique({
      where: { roomId: room.id },
      select: { waterMeterNo: true, electricMeterNo: true },
    });

    return res.json(meter ?? { waterMeterNo: null, electricMeterNo: null });
  } catch (err: any) {
    console.error("GET METER NUMBERS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// PUT /owner/rooms/:roomId/meter-numbers
router.put("/rooms/:roomId/meter-numbers", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const waterMeterNo = typeof req.body?.waterMeterNo === "string" ? req.body.waterMeterNo.trim() : null;
    const electricMeterNo = typeof req.body?.electricMeterNo === "string" ? req.body.electricMeterNo.trim() : null;

    const saved = await prisma.roomMeter.upsert({
      where: { roomId: room.id },
      update: { waterMeterNo, electricMeterNo },
      create: { roomId: room.id, waterMeterNo, electricMeterNo },
    });

    // optional: log history (ถ้าอยาก) -> ข้ามไว้
    return res.json({ ok: true, ...saved, updatedBy: ownerId ?? null });
  } catch (err: any) {
    console.error("SAVE METER NUMBERS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// GET /owner/rooms/:roomId/meters  (เดือนปัจจุบัน)
router.get("/rooms/:roomId/meters", async (req: any, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));
    const cycleMonth = startOfMonth(new Date());

    const cycle = await prisma.meterCycle.findUnique({
      where: { condoId_cycleMonth: { condoId: room.condoId, cycleMonth } },
      select: { id: true, cycleMonth: true, status: true },
    });

    if (!cycle) {
      return res.json({
        roomId: room.id,
        condoId: room.condoId,
        cycle: null,
        prevWater: null,
        currWater: null,
        prevElectric: null,
        currElectric: null,
        waterUnits: null,
        electricUnits: null,
        status: null,
      });
    }

    const reading = await prisma.meterReading.findUnique({
      where: { roomId_cycleId: { roomId: room.id, cycleId: cycle.id } },
      select: {
        prevWater: true,
        currWater: true,
        prevElectric: true,
        currElectric: true,
        waterUnits: true,
        electricUnits: true,
        status: true,
        recordedAt: true,
        note: true,
      },
    });

    return res.json({
      roomId: room.id,
      condoId: room.condoId,
      cycle,
      prevWater: reading?.prevWater ? Number(reading.prevWater) : null,
      currWater: reading?.currWater ? Number(reading.currWater) : null,
      prevElectric: reading?.prevElectric ? Number(reading.prevElectric) : null,
      currElectric: reading?.currElectric ? Number(reading.currElectric) : null,
      waterUnits: reading?.waterUnits ? Number(reading.waterUnits) : null,
      electricUnits: reading?.electricUnits ? Number(reading.electricUnits) : null,
      status: reading?.status ?? null,
      recordedAt: reading?.recordedAt ?? null,
      note: reading?.note ?? null,
    });
  } catch (err: any) {
    console.error("GET METERS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// POST /owner/rooms/:roomId/meters  (บันทึกเดือนปัจจุบัน)
// body: { currWater: number, currElectric: number, note?: string }
router.post("/rooms/:roomId/meters", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const currWaterNum = Number(req.body?.currWater);
    const currElecNum = Number(req.body?.currElectric);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

    if (!Number.isFinite(currWaterNum) || currWaterNum < 0) {
      return res.status(400).json({ message: "currWater must be number >= 0" });
    }
    if (!Number.isFinite(currElecNum) || currElecNum < 0) {
      return res.status(400).json({ message: "currElectric must be number >= 0" });
    }

    const cycle = await getOrCreateCurrentCycle(room.condoId, ownerId ?? null);

    const prevCycle = await prisma.meterCycle.findFirst({
      where: { condoId: room.condoId, cycleMonth: { lt: cycle.cycleMonth } },
      orderBy: { cycleMonth: "desc" },
      select: { id: true },
    });

    let prevWater = 0;
    let prevElectric = 0;

    if (prevCycle) {
      const prevReading = await prisma.meterReading.findUnique({
        where: { roomId_cycleId: { roomId: room.id, cycleId: prevCycle.id } },
        select: { currWater: true, currElectric: true },
      });
      prevWater = prevReading?.currWater ? Number(prevReading.currWater) : 0;
      prevElectric = prevReading?.currElectric ? Number(prevReading.currElectric) : 0;
    }

    const waterUnits = Math.max(0, currWaterNum - prevWater);
    const electricUnits = Math.max(0, currElecNum - prevElectric);

    const saved = await prisma.meterReading.upsert({
      where: { roomId_cycleId: { roomId: room.id, cycleId: cycle.id } },
      update: {
        prevWater: new Prisma.Decimal(String(prevWater)),
        currWater: new Prisma.Decimal(String(currWaterNum)),
        prevElectric: new Prisma.Decimal(String(prevElectric)),
        currElectric: new Prisma.Decimal(String(currElecNum)),
        waterUnits: new Prisma.Decimal(String(waterUnits)),
        electricUnits: new Prisma.Decimal(String(electricUnits)),
        status: "SUBMITTED",
        recordedAt: new Date(),
        recordedBy: ownerId ?? null,
        note: note ?? undefined,
      },
      create: {
        condoId: room.condoId,
        roomId: room.id,
        cycleId: cycle.id,
        prevWater: new Prisma.Decimal(String(prevWater)),
        currWater: new Prisma.Decimal(String(currWaterNum)),
        prevElectric: new Prisma.Decimal(String(prevElectric)),
        currElectric: new Prisma.Decimal(String(currElecNum)),
        waterUnits: new Prisma.Decimal(String(waterUnits)),
        electricUnits: new Prisma.Decimal(String(electricUnits)),
        status: "SUBMITTED",
        recordedAt: new Date(),
        recordedBy: ownerId ?? null,
        note: note ?? null,
      },
    });

    return res.json({
      ok: true,
      cycle,
      reading: {
        prevWater: Number(saved.prevWater ?? 0),
        currWater: Number(saved.currWater ?? 0),
        prevElectric: Number(saved.prevElectric ?? 0),
        currElectric: Number(saved.currElectric ?? 0),
        waterUnits: Number(saved.waterUnits ?? 0),
        electricUnits: Number(saved.electricUnits ?? 0),
        status: saved.status,
        recordedAt: saved.recordedAt,
      },
    });
  } catch (err: any) {
    console.error("SAVE METERS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

/* =========================
   ✅ Tenant Room Code (Access Codes)
   ========================= */

// GET /owner/rooms/:roomId/access-codes
router.get("/rooms/:roomId/access-codes", async (req: any, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const items = await prisma.tenantRoomCode.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        code: true,
        status: true,
        expiresAt: true,
        usedAt: true,
        createdAt: true,
        createdBy: true,
      },
    });

    return res.json({ items });
  } catch (err: any) {
    console.error("LIST ACCESS CODES ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// POST /owner/rooms/:roomId/access-codes
// body: { expiresInDays?: number }
router.post("/rooms/:roomId/access-codes", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    // จำกัด 5 โค้ด ACTIVE ต่อห้อง (ปรับได้)
    const activeCount = await prisma.tenantRoomCode.count({
      where: { roomId: room.id, status: "ACTIVE" },
    });
    if (activeCount >= 5) {
      return res.status(400).json({ error: "Max 5 active access codes per room" });
    }

    // gen code (6-8 chars) แบบอ่านง่าย
    const genCode = () =>
      crypto
        .randomBytes(6)
        .toString("base64url")
        .replace(/[-_]/g, "")
        .slice(0, 8)
        .toUpperCase();

    let code = genCode();
    for (let i = 0; i < 5; i++) {
      const exists = await prisma.tenantRoomCode.findFirst({ where: { code } }); // code @unique
      if (!exists) break;
      code = genCode();
    }

    const daysRaw = Number(req.body?.expiresInDays);
    const expiresInDays =
      Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 365 ? Math.trunc(daysRaw) : null;
    const expiresAt = expiresInDays ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000) : null;

    const created = await prisma.tenantRoomCode.create({
      data: {
        condoId: room.condoId,
        roomId: room.id,
        code,
        status: "ACTIVE",
        expiresAt,
        createdBy: ownerId ?? null,
      },
      select: {
        id: true,
        code: true,
        status: true,
        expiresAt: true,
        createdAt: true,
      },
    });

    return res.status(201).json({ item: created });
  } catch (err: any) {
    console.error("CREATE ACCESS CODE ERROR:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate code, retry" });
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

/* =========================
   Rooms (Step5/6/7/8)
   ========================= */

/* =========================
   (Step6) PATCH /owner/condos/:condoId/rooms/bulk-price
   ========================= */
router.patch("/condos/:condoId/rooms/bulk-price", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const roomIdsRaw = req.body?.roomIds;
    const priceRaw = req.body?.price;

    if (!Array.isArray(roomIdsRaw) || roomIdsRaw.length === 0) {
      return res.status(400).json({ error: "roomIds is required (non-empty array)" });
    }
    if (roomIdsRaw.length > 1000) {
      return res.status(400).json({ error: "Too many roomIds (max 1000)" });
    }

    const roomIds = roomIdsRaw.map((x: any) => String(x)).filter(Boolean);

    let priceNum = 0;
    if (!(priceRaw === null || priceRaw === undefined || String(priceRaw).trim() === "")) {
      const cleaned = String(priceRaw).replace(/,/g, "").trim();
      const n = Number(cleaned);
      if (!Number.isFinite(n) || n < 0) {
        return res.status(400).json({ error: "price must be a number >= 0 (or null)" });
      }
      priceNum = n;
    }

    const updated = await prisma.room.updateMany({
      where: { condoId, id: { in: roomIds } },
      data: { rentPrice: new Prisma.Decimal(String(priceNum)) },
    });

    return res.json({ ok: true, updated: updated.count, price: priceNum });
  } catch (err: any) {
    console.error("BULK SET PRICE ERROR:", err);
    return res.status(500).json({ error: "Failed to set room prices" });
  }
});

/* =========================
   (Step7) PATCH /owner/condos/:condoId/rooms/bulk-occupancy
   ========================= */
router.patch("/condos/:condoId/rooms/bulk-occupancy", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const roomIdsRaw = req.body?.roomIds;
    const occupancyStatusRaw = String(req.body?.occupancyStatus ?? "").toUpperCase();

    if (!Array.isArray(roomIdsRaw) || roomIdsRaw.length === 0) {
      return res.status(400).json({ error: "roomIds is required (non-empty array)" });
    }
    if (roomIdsRaw.length > 1000) {
      return res.status(400).json({ error: "Too many roomIds (max 1000)" });
    }

    const okStatus = occupancyStatusRaw === "VACANT" || occupancyStatusRaw === "OCCUPIED";
    if (!okStatus) {
      return res.status(400).json({ error: "occupancyStatus must be VACANT|OCCUPIED" });
    }

    const roomIds = roomIdsRaw.map((x: any) => String(x)).filter(Boolean);

    const updated = await prisma.room.updateMany({
      where: { condoId, id: { in: roomIds } },
      data: { occupancyStatus: occupancyStatusRaw as any },
    });

    return res.json({ ok: true, updated: updated.count, occupancyStatus: occupancyStatusRaw });
  } catch (err: any) {
    console.error("BULK OCCUPANCY ERROR:", err);
    return res.status(500).json({ error: "Failed to set occupancy status" });
  }
});

/* =========================
   (Step8 - NEW) Multi-service
   PUT /owner/condos/:condoId/room-services/assign-bulk
   ========================= */
router.put("/condos/:condoId/room-services/assign-bulk", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const roomIdsRaw = req.body?.roomIds;
    const serviceIdRaw = req.body?.serviceId;

    if (!Array.isArray(roomIdsRaw) || roomIdsRaw.length === 0) {
      return res.status(400).json({ error: "roomIds is required (non-empty array)" });
    }
    if (roomIdsRaw.length > 1000) {
      return res.status(400).json({ error: "Too many roomIds (max 1000)" });
    }

    const serviceId = typeof serviceIdRaw === "string" ? serviceIdRaw.trim() : "";
    if (!serviceId) return res.status(400).json({ error: "serviceId is required" });

    const svc = await prisma.condoService.findFirst({
      where: { id: serviceId, condoId },
      select: { id: true },
    });
    if (!svc) return res.status(400).json({ error: "Invalid serviceId (not in this condo)" });

    const roomIds = roomIdsRaw.map((x: any) => String(x)).filter(Boolean);

    const validRooms = await prisma.room.findMany({
      where: { condoId, id: { in: roomIds } },
      select: { id: true },
    });
    const validRoomIds = validRooms.map((r) => r.id);
    if (validRoomIds.length === 0) return res.json({ ok: true, assigned: 0 });

    const created = await prisma.roomExtraChargeAssignment.createMany({
      data: validRoomIds.map((roomId) => ({
        roomId,
        serviceId,
        createdBy: ownerId,
      })),
      skipDuplicates: true,
    });

    return res.json({ ok: true, assigned: created.count, serviceId });
  } catch (err: any) {
    console.error("ASSIGN ROOM SERVICE BULK ERROR:", err);
    return res.status(500).json({ error: "Failed to assign room service" });
  }
});

/* =========================
   (Step8 - NEW) Multi-service
   PUT /owner/condos/:condoId/room-services/remove-bulk
   ========================= */
router.put("/condos/:condoId/room-services/remove-bulk", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const roomIdsRaw = req.body?.roomIds;
    const serviceIdRaw = req.body?.serviceId;

    if (!Array.isArray(roomIdsRaw) || roomIdsRaw.length === 0) {
      return res.status(400).json({ error: "roomIds is required (non-empty array)" });
    }
    if (roomIdsRaw.length > 1000) {
      return res.status(400).json({ error: "Too many roomIds (max 1000)" });
    }

    const serviceId = typeof serviceIdRaw === "string" ? serviceIdRaw.trim() : "";
    if (!serviceId) return res.status(400).json({ error: "serviceId is required" });

    const svc = await prisma.condoService.findFirst({
      where: { id: serviceId, condoId },
      select: { id: true },
    });
    if (!svc) return res.status(400).json({ error: "Invalid serviceId (not in this condo)" });

    const roomIds = roomIdsRaw.map((x: any) => String(x)).filter(Boolean);

    const validRooms = await prisma.room.findMany({
      where: { condoId, id: { in: roomIds } },
      select: { id: true },
    });
    const validRoomIds = validRooms.map((r) => r.id);
    if (validRoomIds.length === 0) return res.json({ ok: true, removed: 0 });

    const deleted = await prisma.roomExtraChargeAssignment.deleteMany({
      where: { roomId: { in: validRoomIds }, serviceId },
    });

    return res.json({ ok: true, removed: deleted.count, serviceId });
  } catch (err: any) {
    console.error("REMOVE ROOM SERVICE BULK ERROR:", err);
    return res.status(500).json({ error: "Failed to remove room service" });
  }
});

/* =========================
   (Step8) PATCH /owner/condos/:condoId/rooms/bulk-service
   ========================= */
router.patch("/condos/:condoId/rooms/bulk-service", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const roomIdsRaw = req.body?.roomIds;
    const serviceIdRaw = req.body?.serviceId;

    if (!Array.isArray(roomIdsRaw) || roomIdsRaw.length === 0) {
      return res.status(400).json({ error: "roomIds is required (non-empty array)" });
    }

    const roomIds = roomIdsRaw.map((x: any) => String(x)).filter(Boolean);

    const validRooms = await prisma.room.findMany({
      where: { condoId, id: { in: roomIds } },
      select: { id: true },
    });

    const validRoomIds = validRooms.map((r) => r.id);
    if (validRoomIds.length === 0) {
      return res.json({ ok: true, updated: 0 });
    }

    // REMOVE ALL SERVICES
    if (serviceIdRaw === null || serviceIdRaw === undefined || String(serviceIdRaw).trim() === "") {
      const deleted = await prisma.roomExtraChargeAssignment.deleteMany({
        where: { roomId: { in: validRoomIds } },
      });

      return res.json({
        ok: true,
        updated: deleted.count,
        serviceId: null,
      });
    }

    // SET SERVICE (replace ทั้งหมดให้เหลือ service เดียว)
    const serviceId = String(serviceIdRaw).trim();

    const svc = await prisma.condoService.findFirst({
      where: { id: serviceId, condoId },
      select: { id: true },
    });

    if (!svc) {
      return res.status(400).json({ error: "Invalid serviceId (not in this condo)" });
    }

    await prisma.roomExtraChargeAssignment.deleteMany({
      where: { roomId: { in: validRoomIds } },
    });

    const created = await prisma.roomExtraChargeAssignment.createMany({
      data: validRoomIds.map((roomId) => ({
        roomId,
        serviceId,
        createdBy: ownerId,
      })),
      skipDuplicates: true,
    });

    return res.json({
      ok: true,
      updated: created.count,
      serviceId,
    });
  } catch (err: any) {
    console.error("BULK SERVICE ERROR:", err);
    return res.status(500).json({ error: "Failed to set room service" });
  }
});

/* =========================
   POST /owner/condos/:condoId/rooms
   ========================= */
router.post("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const body = req.body ?? {};

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const floorNum = asRequiredInt(body.floor);
    if (floorNum === null) return res.status(400).json({ error: "floor is required (number)" });
    if (floorNum < 1 || floorNum > 100) return res.status(400).json({ error: "floor must be 1-100" });

    // AUTO MODE
    const roomNoMaybe = asTrimmedString(body.roomNo) ?? asTrimmedString(body.number);
    const rentRaw = body.rentPrice ?? body.price;
    const isAuto = !roomNoMaybe && (rentRaw === undefined || rentRaw === null || String(rentRaw).trim() === "");

    if (isAuto) {
      const count = await prisma.room.count({ where: { condoId, floor: floorNum } });
      if (count >= 50) return res.status(400).json({ error: "Max 50 rooms per floor" });

      const nextIndex = count + 1;
      const autoRoomNo = `${floorNum}${pad2(nextIndex)}`;

      const created = await prisma.room.create({
        data: {
          condoId,
          roomNo: autoRoomNo,
          floor: floorNum,
          rentPrice: new Prisma.Decimal("0"),
          deposit: null,
          size: null,
        } as any,
      });

      return res.status(201).json(created);
    }

    // MANUAL MODE
    const roomNo = roomNoMaybe;
    if (!roomNo) return res.status(400).json({ error: "roomNo (or number) is required (string)" });

    const rentNum = asOptionalMoneyNumber(rentRaw);
    if (rentNum === null) return res.status(400).json({ error: "rentPrice (or price) is required" });

    const depositNum = asOptionalMoneyNumber(body.deposit);
    const sizeNum = asOptionalMoneyNumber(body.size);

    const room = await prisma.room.create({
      data: {
        condoId,
        roomNo,
        floor: floorNum,
        rentPrice: new Prisma.Decimal(String(rentNum)),
        deposit: depositNum !== null ? new Prisma.Decimal(String(depositNum)) : null,
        size: sizeNum !== null ? new Prisma.Decimal(String(sizeNum)) : null,
      },
    });

    return res.status(201).json(room);
  } catch (err: any) {
    if (err?.code === "P2002") return res.status(409).json({ error: "Room already exists (unique)" });
    console.error("CREATE ROOM ERROR:", err);
    return res.status(500).json({ error: "Failed to create room", detail: String(err?.message ?? err) });
  }
});

/* =========================
   GET /owner/condos/:condoId/rooms
   ========================= */
router.get("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const rooms = await prisma.room.findMany({
      where: { condoId },
      orderBy: [{ floor: "asc" }, { roomNo: "asc" }],
      select: {
        id: true,
        floor: true,
        roomNo: true,
        rentPrice: true,
        isActive: true,
        occupancyStatus: true,
        roomStatus: true,
        extraChargeAssignments: {
          select: { serviceId: true },
        },
      },
    });

    return res.json(
      rooms.map((r) => {
        const serviceIds = Array.from(
          new Set((r.extraChargeAssignments ?? []).map((x) => x.serviceId).filter(Boolean))
        );

        return {
          id: r.id,
          floor: r.floor,
          roomNo: r.roomNo,
          price: Number(r.rentPrice),
          isActive: r.isActive,
          occupancyStatus: r.occupancyStatus,
          roomStatus: r.roomStatus,
          serviceId: serviceIds[0] ?? null,
          serviceIds,
        };
      })
    );
  } catch (err: any) {
    console.error("LIST ROOMS ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// =========================
// GET /owner/rooms/:roomId  (RoomDetailPage)
// =========================
router.get("/rooms/:roomId", async (req: any, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const full = await prisma.room.findUnique({
      where: { id: room.id },
      select: {
        id: true,
        condoId: true,
        floor: true,
        roomNo: true,
        rentPrice: true,
        deposit: true,
        size: true,
        isActive: true,
        occupancyStatus: true,
        roomStatus: true,
        createdAt: true,
        updatedAt: true,
        meter: { select: { waterMeterNo: true, electricMeterNo: true } },
        extraChargeAssignments: { select: { serviceId: true, service: { select: { id: true, name: true, price: true } } } },
      },
    });

    if (!full) return res.status(404).json({ error: "Room not found" });

    return res.json({
      id: full.id,
      condoId: full.condoId,
      floor: full.floor,
      roomNo: full.roomNo,
      rentPrice: Number(full.rentPrice ?? 0),
      deposit: full.deposit ? Number(full.deposit) : null,
      size: full.size ? Number(full.size) : null,
      isActive: full.isActive,
      occupancyStatus: full.occupancyStatus,
      roomStatus: full.roomStatus,
      meter: full.meter ?? { waterMeterNo: null, electricMeterNo: null },
      services: (full.extraChargeAssignments ?? []).map((a) => ({
        serviceId: a.serviceId,
        name: a.service?.name ?? "",
        price: a.service?.price ? Number(a.service.price) : 0,
      })),
    });
  } catch (err: any) {
    console.error("GET ROOM DETAIL ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// =========================
// MonthlyContractPage (RentalContract)
// =========================

// GET /owner/rooms/:roomId/contracts
router.get("/rooms/:roomId/contracts", async (req: any, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const items = await prisma.rentalContract.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        condoId: true,
        roomId: true,
        tenantUserId: true,
        moveInDate: true,
        moveOutDate: true,
        monthlyRent: true,
        securityDeposit: true,
        depositPaidBy: true,
        bookingFeeApplied: true,
        status: true,
        createdAt: true,
        tenant: { select: { id: true, name: true, email: true, phone: true } },
      },
    });

    return res.json({
      items: items.map((c) => ({
        ...c,
        monthlyRent: Number(c.monthlyRent ?? 0),
        securityDeposit: Number(c.securityDeposit ?? 0),
        bookingFeeApplied: c.bookingFeeApplied ? Number(c.bookingFeeApplied) : 0,
      })),
    });
  } catch (err: any) {
    console.error("LIST CONTRACTS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// GET /owner/contracts/:contractId
router.get("/contracts/:contractId", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;
    const contractId = String(req.params.contractId);

    const found = await prisma.rentalContract.findFirst({
      where: { id: contractId, condo: { ownerUserId: ownerId } },
      include: { tenant: { select: { id: true, name: true, email: true, phone: true } }, room: true },
    });

    if (!found) return res.status(404).json({ error: "Contract not found" });

    return res.json({
      ...found,
      monthlyRent: Number(found.monthlyRent ?? 0),
      securityDeposit: Number(found.securityDeposit ?? 0),
      bookingFeeApplied: found.bookingFeeApplied ? Number(found.bookingFeeApplied) : 0,
    });
  } catch (err: any) {
    console.error("GET CONTRACT ERROR:", err);
    return res.status(500).json({ error: "Failed" });
  }
});

// POST /owner/rooms/:roomId/contracts
router.post("/rooms/:roomId/contracts", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const tenantUserId = String(req.body?.tenantUserId ?? "");
    const moveInDate = req.body?.moveInDate ? new Date(req.body.moveInDate) : null;

    const monthlyRent = Number(String(req.body?.monthlyRent ?? "").replace(/,/g, ""));
    const securityDeposit = Number(String(req.body?.securityDeposit ?? "").replace(/,/g, ""));

    const depositPaidBy = String(req.body?.depositPaidBy ?? "CASH");
    const bookingFeeApplied = req.body?.bookingFeeApplied == null ? 0 : Number(req.body.bookingFeeApplied);

    if (!tenantUserId) return res.status(400).json({ error: "tenantUserId is required" });
    if (!moveInDate || isNaN(moveInDate.getTime())) return res.status(400).json({ error: "moveInDate is required" });
    if (!Number.isFinite(monthlyRent) || monthlyRent < 0) return res.status(400).json({ error: "monthlyRent invalid" });
    if (!Number.isFinite(securityDeposit) || securityDeposit < 0) return res.status(400).json({ error: "securityDeposit invalid" });

    // (ทางเลือก) กันซ้อน: ห้องเดียวมี ACTIVE ได้ 1 สัญญา
    const active = await prisma.rentalContract.findFirst({
      where: { roomId: room.id, status: "ACTIVE" },
      select: { id: true },
    });
    if (active) return res.status(400).json({ error: "This room already has an ACTIVE contract" });

    const created = await prisma.rentalContract.create({
      data: {
        condoId: room.condoId,
        roomId: room.id,
        tenantUserId,
        moveInDate,
        monthlyRent: new Prisma.Decimal(String(monthlyRent)),
        securityDeposit: new Prisma.Decimal(String(securityDeposit)),
        depositPaidBy,
        bookingFeeApplied: new Prisma.Decimal(String(bookingFeeApplied ?? 0)),
        status: "ACTIVE",
      } as any,
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error("CREATE CONTRACT ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// PATCH /owner/contracts/:contractId
router.patch("/contracts/:contractId", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;
    const contractId = String(req.params.contractId);

    const found = await prisma.rentalContract.findFirst({
      where: { id: contractId, condo: { ownerUserId: ownerId } },
      select: { id: true },
    });
    if (!found) return res.status(404).json({ error: "Contract not found" });

    const data: any = {};
    if (req.body?.moveOutDate) data.moveOutDate = new Date(req.body.moveOutDate);
    if (req.body?.status) data.status = req.body.status;

    if (req.body?.monthlyRent != null) {
      const n = Number(String(req.body.monthlyRent).replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "monthlyRent invalid" });
      data.monthlyRent = new Prisma.Decimal(String(n));
    }

    if (req.body?.securityDeposit != null) {
      const n = Number(String(req.body.securityDeposit).replace(/,/g, ""));
      if (!Number.isFinite(n) || n < 0) return res.status(400).json({ error: "securityDeposit invalid" });
      data.securityDeposit = new Prisma.Decimal(String(n));
    }

    const updated = await prisma.rentalContract.update({ where: { id: contractId }, data });
    return res.json(updated);
  } catch (err: any) {
    console.error("UPDATE CONTRACT ERROR:", err);
    return res.status(500).json({ error: "Failed" });
  }
});
/* =========================
   (Step5) POST /owner/condos/:condoId/rooms/generate
   ========================= */
router.post("/condos/:condoId/rooms/generate", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const existing = await prisma.room.count({ where: { condoId } });
    if (existing > 0) return res.json({ ok: true, created: 0 });

    const floors = await prisma.condoFloor.findMany({
      where: { condoId },
      orderBy: { floorNo: "asc" },
    });

    if (!floors.length) return res.status(400).json({ error: "Missing floor-config (Step4)" });

    const data: Prisma.RoomCreateManyInput[] = [];
    for (const f of floors) {
      for (let i = 1; i <= f.roomsCount; i++) {
        data.push({
          condoId,
          floor: f.floorNo,
          roomNo: `${f.floorNo}${String(i).padStart(2, "0")}`,
          rentPrice: new Prisma.Decimal("0"),
        } as any);
      }
    }

    await prisma.room.createMany({ data });
    return res.status(201).json({ ok: true, created: data.length });
  } catch (err: any) {
    console.error("GENERATE ROOMS ERROR:", err);
    return res.status(500).json({ error: "Failed to generate rooms" });
  }
});

/* =========================
   (Step5) PATCH /owner/condos/:condoId/rooms/:roomId
   ========================= */
router.patch("/condos/:condoId/rooms/:roomId", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const roomId = String(req.params.roomId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const existing = await prisma.room.findFirst({
      where: { id: roomId, condoId },
    });
    if (!existing) return res.status(404).json({ error: "Room not found" });

    const { roomNo, isActive, occupancyStatus, roomStatus } = req.body ?? {};

    const updated = await prisma.$transaction(async (tx) => {
      const room = await tx.room.update({
        where: { id: roomId },
        data: {
          ...(roomNo ? { roomNo: String(roomNo).trim() } : {}),
          ...(typeof isActive === "boolean" ? { isActive } : {}),
          ...(occupancyStatus ? { occupancyStatus } : {}),
          ...(roomStatus ? { roomStatus } : {}),
        },
      });

      const changedOccupancy = !!occupancyStatus && occupancyStatus !== existing.occupancyStatus;
      const changedRoomStatus = !!roomStatus && roomStatus !== existing.roomStatus;

      if (changedOccupancy || changedRoomStatus) {
        await tx.roomStatusHistory.create({
          data: {
            roomId,
            oldOccupancyStatus: existing.occupancyStatus,
            newOccupancyStatus: occupancyStatus ?? existing.occupancyStatus,
            oldRoomStatus: existing.roomStatus,
            newRoomStatus: roomStatus ?? existing.roomStatus,
            changedBy: ownerId,
          },
        });
      }

      return room;
    });

    return res.json({
      id: updated.id,
      floor: updated.floor,
      roomNo: updated.roomNo,
      price: Number(updated.rentPrice),
      isActive: updated.isActive,
      occupancyStatus: updated.occupancyStatus,
      roomStatus: updated.roomStatus,
    });
  } catch (err: any) {
    console.error("UPDATE ROOM ERROR:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate roomNo" });
    return res.status(500).json({ error: "Failed to update room" });
  }
});

/* =========================
   (Step5) DELETE /owner/condos/:condoId/rooms/:roomId
   ========================= */
router.delete("/condos/:condoId/rooms/:roomId", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const roomId = String(req.params.roomId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const room = await prisma.room.findFirst({
      where: { id: roomId, condoId },
      select: { id: true, floor: true },
    });
    if (!room) return res.status(404).json({ error: "Room not found" });

    await prisma.$transaction(async (tx) => {
      await tx.room.delete({ where: { id: roomId } });

      const list = await tx.room.findMany({
        where: { condoId, floor: room.floor },
        orderBy: [{ roomNo: "asc" }, { createdAt: "asc" }],
        select: { id: true },
      });

      for (let i = 0; i < list.length; i++) {
        const rid = list[i].id;
        const tmp = `${room.floor}TMP_${pad2(i + 1)}_${String(rid).slice(0, 8)}`;
        await tx.room.update({
          where: { id: rid },
          data: { roomNo: tmp },
        });
      }

      for (let i = 0; i < list.length; i++) {
        const rid = list[i].id;
        const finalNo = `${room.floor}${pad2(i + 1)}`;
        await tx.room.update({
          where: { id: rid },
          data: { roomNo: finalNo },
        });
      }
    });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE ROOM ERROR:", err);
    if (err?.code === "P2002") {
      return res.status(409).json({ error: "Duplicate roomNo while renumbering" });
    }
    return res.status(500).json({ error: "Failed to delete room" });
  }
});

/* =========================
   Services (Additional fees)
   ========================= */
router.get("/condos/:condoId/services", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const list = await prisma.condoService.findMany({
      where: { condoId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(list);
  } catch (err: any) {
    console.error("LIST SERVICES ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch services" });
  }
});

router.post("/condos/:condoId/services", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const price = Number(body.price);

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!Number.isFinite(price) || price < 0) return res.status(400).json({ error: "price must be >= 0" });

    const isVariable = Boolean(body.isVariable);
    const variableType = String(body.variableType ?? "NONE");

    const created = await prisma.condoService.create({
      data: {
        condoId,
        name,
        price: new Prisma.Decimal(String(price)),
        isVariable,
        variableType,
        createdBy: ownerId,
      } as any,
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error("CREATE SERVICE ERROR:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate service" });
    return res.status(500).json({ error: "Failed to create service" });
  }
});

router.delete("/condos/:condoId/services/:serviceId", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const serviceId = String(req.params.serviceId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const found = await prisma.condoService.findFirst({
      where: { id: serviceId, condoId },
      select: { id: true },
    });
    if (!found) return res.status(404).json({ error: "Service not found" });

    await prisma.condoService.delete({ where: { id: serviceId } });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE SERVICE ERROR:", err);
    return res.status(500).json({ error: "Failed to delete service" });
  }
});

/* =========================
   Utilities (Water/Electric billing)
   ========================= */
router.get("/condos/:condoId/utilities", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const list = await prisma.condoUtilitySetting.findMany({
      where: { condoId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(list);
  } catch (err: any) {
    console.error("LIST UTILITIES ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch utilities" });
  }
});

router.post("/condos/:condoId/utilities", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const body = req.body ?? {};
    const utilityType = String(body.utilityType ?? "").toUpperCase();
    const billingType = String(body.billingType ?? "").toUpperCase();
    const rate = Number(String(body.rate ?? "").replace(/,/g, "").trim());

    const okUtility = utilityType === "WATER" || utilityType === "ELECTRIC";
    const okBilling = billingType === "METER" || billingType === "METER_MIN" || billingType === "FLAT";

    if (!okUtility) return res.status(400).json({ error: "utilityType must be WATER|ELECTRIC" });
    if (!okBilling) return res.status(400).json({ error: "billingType must be METER|METER_MIN|FLAT" });
    if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: "rate must be >= 0" });

    const saved = await prisma.condoUtilitySetting.upsert({
      where: { condoId_utilityType: { condoId, utilityType: utilityType as any } },
      update: {
        billingType: billingType as any,
        rate: new Prisma.Decimal(String(rate)),
      },
      create: {
        condoId,
        utilityType: utilityType as any,
        billingType: billingType as any,
        rate: new Prisma.Decimal(String(rate)),
        createdBy: ownerId,
      },
    });

    return res.status(201).json(saved);
  } catch (err: any) {
    console.error("SAVE UTILITY ERROR:", err);
    return res.status(500).json({ error: "Failed to save utility" });
  }
});

/* =========================
   Bank Accounts (Step3)
   ========================= */
router.get("/condos/:condoId/bank-accounts", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const list = await prisma.condoBankAccount.findMany({
      where: { condoId },
      orderBy: { createdAt: "asc" },
    });

    return res.json(list);
  } catch (err: any) {
    console.error("LIST BANK ACCOUNTS ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch bank accounts" });
  }
});

router.post("/condos/:condoId/bank-accounts", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const bankCode = asBankCode(req.body?.bankCode);
    const accountName = asRequiredTrimmedString(req.body?.accountName);
    const accountNo = asRequiredTrimmedString(req.body?.accountNo);

    if (!bankCode) return res.status(400).json({ error: "bankCode is required" });
    if (!accountName) return res.status(400).json({ error: "accountName is required" });
    if (!accountNo) return res.status(400).json({ error: "accountNo is required" });

    const count = await prisma.condoBankAccount.count({ where: { condoId } });
    if (count >= 2) return res.status(400).json({ error: "Max 2 bank accounts" });

    const created = await prisma.condoBankAccount.create({
      data: {
        condoId,
        bankCode,
        bankName: BANK_NAME_MAP[bankCode] ?? bankCode,
        accountName,
        accountNo,
        createdBy: ownerId,
      },
    });

    return res.status(201).json(created);
  } catch (err: any) {
    console.error("CREATE BANK ACCOUNT ERROR:", err);
    if (err?.code === "P2002") return res.status(409).json({ error: "Duplicate bank account" });
    return res.status(500).json({ error: "Failed to create bank account" });
  }
});

router.delete("/condos/:condoId/bank-accounts/:accountId", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const accountId = String(req.params.accountId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const found = await prisma.condoBankAccount.findFirst({
      where: { id: accountId, condoId },
      select: { id: true },
    });
    if (!found) return res.status(404).json({ error: "Bank account not found" });

    await prisma.condoBankAccount.delete({ where: { id: accountId } });
    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE BANK ACCOUNT ERROR:", err);
    return res.status(500).json({ error: "Failed to delete bank account" });
  }
});

/* =========================
   Payment Instruction (Step3)
   ========================= */
router.get("/condos/:condoId/payment-instruction", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const row = await prisma.condoPaymentInstruction.findUnique({ where: { condoId } });
    return res.json(row ?? { condoId, message: "" });
  } catch (err: any) {
    console.error("GET PAYMENT INSTRUCTION ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch payment instruction" });
  }
});

router.put("/condos/:condoId/payment-instruction", async (req, res) => {
  try {
    const ownerId = (req as any).user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const message = asTrimmedString(req.body?.message) ?? "";
    if (message.length > 1000) return res.status(400).json({ error: "message too long (max 1000 chars)" });

    const saved = await prisma.condoPaymentInstruction.upsert({
      where: { condoId },
      create: { condoId, message, updatedBy: ownerId },
      update: { message, updatedBy: ownerId },
    });

    return res.json(saved);
  } catch (err: any) {
    console.error("SAVE PAYMENT INSTRUCTION ERROR:", err);
    return res.status(500).json({ error: "Failed to save payment instruction" });
  }
});

/** =============================
 * Staff management (Owner) - MVP
 * ============================= */

router.get("/condos/:condoId/staff", async (req, res) => {
  const ownerId = (req as any).user?.id;
  if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

  const condoId = String(req.params.condoId);
  try {
    await ensurePermissionCatalog(DEFAULT_PERMISSION_MODULES as any);
    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const memberships = await prisma.staffMembership.findMany({
      where: { condoId },
      select: {
        id: true,
        staffUserId: true,
        staffPosition: true,
        isActive: true,
        createdAt: true,
        staff: { select: { id: true, name: true, email: true, phone: true } },
      },
      orderBy: { createdAt: "desc" },
    });

    const items = await Promise.all(
      memberships.map(async (m) => ({
        id: m.id,
        staffUserId: m.staffUserId,
        fullName: m.staff?.name ?? "",
        email: m.staff?.email ?? "",
        phone: m.staff?.phone ?? "",
        staffPosition: m.staffPosition,
        isActive: m.isActive,
        allowedModules: await getAllowedModulesForMembership(m.id),
      }))
    );

    return res.json({ items });
  } catch (err: any) {
    console.error("LIST STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to list staff" });
  }
});

router.post("/condos/:condoId/staff", async (req, res) => {
  const ownerId = (req as any).user?.id;
  if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

  const condoId = String(req.params.condoId);
  const body = req.body ?? {};

  const fullName = String(body.fullName ?? "").trim();
  const email = String(body.email ?? "").trim().toLowerCase();
  const phone = body.phone ? String(body.phone).trim() : null;

  const staffPosition = String(body.staffPosition ?? "").trim();

  const allowedModulesRaw = Array.isArray(body.allowedModules) ? body.allowedModules : [];
  const allowedModules = allowedModulesRaw
    .map((m: any) => String(m))
    .filter((m: any) => DEFAULT_PERMISSION_MODULES.includes(m as any)) as PermissionModuleStr[];

  if (!fullName) return res.status(400).json({ error: "fullName is required" });
  if (!email) return res.status(400).json({ error: "email is required" });
  if (!staffPosition) return res.status(400).json({ error: "staffPosition is required" });

  try {
    await ensurePermissionCatalog(DEFAULT_PERMISSION_MODULES as any);

    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const existing = await prisma.user.findFirst({
      where: { OR: [{ email }, ...(phone ? [{ phone }] : [])] },
      select: {
        id: true,
        role: true,
        email: true,
        phone: true,
        name: true,
        emailVerifiedAt: true,
        phoneVerifiedAt: true,
      },
    });

    if (existing && existing.role !== "STAFF") {
      return res.status(400).json({ error: "This email/phone is already used by non-staff user" });
    }

    let staffUser = existing;

    if (!staffUser) {
      const initialSecret = crypto.randomBytes(24).toString("base64url");
      const passwordHash = await bcrypt.hash(initialSecret, 10);

      staffUser = await prisma.user.create({
        data: {
          email,
          phone,
          name: fullName,
          role: "STAFF",
          passwordHash,
          isActive: true,
          verifyChannel: "EMAIL",
          emailVerifiedAt: new Date(),
          phoneVerifiedAt: phone ? new Date() : null,
        },
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          role: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
        },
      });
    } else {
      staffUser = await prisma.user.update({
        where: { id: staffUser.id },
        data: {
          name: fullName,
          phone: phone ?? undefined,
          email,
          role: "STAFF",
          isActive: true,
          emailVerifiedAt: staffUser.emailVerifiedAt ?? new Date(),
          phoneVerifiedAt: staffUser.phoneVerifiedAt ?? (phone ? new Date() : undefined),
        },
        select: {
          id: true,
          email: true,
          phone: true,
          name: true,
          role: true,
          emailVerifiedAt: true,
          phoneVerifiedAt: true,
        },
      });
    }

    if (!staffUser) return res.status(500).json({ error: "Failed to create staff user" });

    const membership = await prisma.staffMembership.upsert({
      where: { staffUserId_condoId: { staffUserId: staffUser.id, condoId } },
      create: {
        staffUserId: staffUser.id,
        condoId,
        staffPosition,
        isActive: true,
      },
      update: {
        staffPosition,
        isActive: true,
      },
      select: {
        id: true,
        staffPosition: true,
        isActive: true,
      },
    });

    await replaceMembershipOverrides(membership.id, allowedModules);

    const token = crypto.randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const frontend = process.env.FRONTEND_URL || "http://localhost:5173";
    const inviteUrl = `${frontend}/staff/invite/${token}`;

    const invite = await prisma.staffInvite.create({
      data: {
        condoId,
        staffUserId: staffUser.id,
        email,
        phone: phone ?? null,
        token,
        staffPosition,
        expiresAt,
        createdByUserId: ownerId,
      },
      select: { token: true, expiresAt: true },
    });

    let emailSent = false;
    try {
      await sendStaffInviteEmail(email, {
        inviteUrl,
        condoName: condo.nameTh,
      });
      emailSent = true;
    } catch (mailErr) {
      console.error("SEND STAFF INVITE EMAIL ERROR:", mailErr);
    }

    return res.status(201).json({
      item: {
        id: membership.id,
        staffUserId: staffUser.id,
        fullName: staffUser.name,
        email: staffUser.email,
        phone: staffUser.phone,
        staffPosition: membership.staffPosition,
        isActive: membership.isActive,
        allowedModules,
      },
      invite: {
        token: invite.token,
        inviteUrl,
        expiresAt: invite.expiresAt,
      },
      emailSent,
    });
  } catch (err: any) {
    console.error("CREATE STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to create staff" });
  }
});

router.patch("/condos/:condoId/staff/:membershipId", async (req, res) => {
  const ownerId = (req as any).user?.id;
  if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

  const condoId = String(req.params.condoId);
  const membershipId = String(req.params.membershipId);
  const body = req.body ?? {};

  try {
    await ensurePermissionCatalog(DEFAULT_PERMISSION_MODULES as any);
    const condo = await assertOwnerCondo(ownerId, condoId);
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const membership = await prisma.staffMembership.findFirst({
      where: { id: membershipId, condoId },
      select: { id: true, staffUserId: true },
    });
    if (!membership) return res.status(404).json({ error: "Staff membership not found" });

    const dataMem: any = {};
    if ("staffPosition" in body) dataMem.staffPosition = body.staffPosition ? String(body.staffPosition).trim() : null;
    if ("isActive" in body) dataMem.isActive = Boolean(body.isActive);
    if (Object.keys(dataMem).length) await prisma.staffMembership.update({ where: { id: membershipId }, data: dataMem });

    const dataUser: any = {};
    if ("fullName" in body) dataUser.name = body.fullName ? String(body.fullName).trim() : undefined;
    if ("email" in body) dataUser.email = body.email ? String(body.email).trim().toLowerCase() : undefined;
    if ("phone" in body) dataUser.phone = body.phone ? String(body.phone).trim() : undefined;
    if (Object.keys(dataUser).length) await prisma.user.update({ where: { id: membership.staffUserId }, data: dataUser });

    if (Array.isArray(body.allowedModules)) {
      const allowedModules = body.allowedModules
        .map((m: any) => String(m))
        .filter((m: any) => DEFAULT_PERMISSION_MODULES.includes(m as any)) as PermissionModuleStr[];
      await replaceMembershipOverrides(membershipId, allowedModules);
    }

    const row = await prisma.staffMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        staffUserId: true,
        staffPosition: true,
        isActive: true,
        staff: { select: { name: true, email: true, phone: true } },
      },
    });

    return res.json({
      item: {
        id: row!.id,
        staffUserId: row!.staffUserId,
        fullName: row!.staff?.name ?? "",
        email: row!.staff?.email ?? "",
        phone: row!.staff?.phone ?? "",
        staffPosition: row!.staffPosition,
        isActive: row!.isActive,
        allowedModules: await getAllowedModulesForMembership(row!.id),
      },
    });
  } catch (err: any) {
    console.error("UPDATE STAFF ERROR:", err);
    return res.status(500).json({ error: "Failed to update staff" });
  }
});

/* =========================
   ✅ Tenant Room Code (Access Codes) - Disable/Delete
   ========================= */

// PATCH /owner/rooms/:roomId/access-codes/:codeId/disable
router.patch("/rooms/:roomId/access-codes/:codeId/disable", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const roomId = String(req.params.roomId);
    const codeId = String(req.params.codeId);

    // ต้องเป็น owner ของคอนโดที่ห้องนี้อยู่
    await assertOwnerRoomOrThrow(req, roomId);

    const found = await prisma.tenantRoomCode.findFirst({
      where: { id: codeId, roomId },
      select: { id: true, status: true },
    });

    if (!found) return res.status(404).json({ error: "Access code not found" });

    const updated = await prisma.tenantRoomCode.update({
      where: { id: codeId },
      data: {
        status: "DISABLED",
        // (ทางเลือก) ถ้าอยากกัน reuse แบบ “หมดอายุทันที” ด้วย:
        // expiresAt: new Date(),
      },
      select: {
        id: true,
        code: true,
        status: true,
        expiresAt: true,
        usedAt: true,
        usedByUserId: true,
      },
    });

    return res.json({ ok: true, item: updated });
  } catch (err: any) {
    console.error("DISABLE ACCESS CODE ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// DELETE /owner/rooms/:roomId/access-codes/:codeId
router.delete("/rooms/:roomId/access-codes/:codeId", async (req: any, res) => {
  try {
    await assertOwnerRoomOrThrow(req, String(req.params.roomId));
    const codeId = String(req.params.codeId);

    const found = await prisma.tenantRoomCode.findFirst({
      where: { id: codeId, roomId: String(req.params.roomId) },
      select: { id: true },
    });
    if (!found) return res.status(404).json({ error: "Access code not found" });

    await prisma.tenantRoomCode.delete({ where: { id: codeId } });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE ACCESS CODE ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});
/* =========================================================
   Advance Payments
   ========================================================= */

// GET /owner/rooms/:roomId/advance-payments
router.get("/rooms/:roomId/advance-payments", async (req: any, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const items = await prisma.advancePayment.findMany({
      where: { roomId: room.id },
      orderBy: { createdAt: "desc" },
    });

    return res.json(items.map((x) => ({
      ...x,
      amount: Number(x.amount),
    })));
  } catch (err: any) {
    console.error("LIST ADVANCE PAYMENTS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// POST /owner/rooms/:roomId/advance-payments
router.post("/rooms/:roomId/advance-payments", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;

    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const amount = Number(req.body?.amount);
    const note = typeof req.body?.note === "string" ? req.body.note.trim() : null;

    if (!Number.isFinite(amount) || amount <= 0) {
      return res.status(400).json({ error: "amount must be > 0" });
    }

    const created = await prisma.advancePayment.create({
      data: {
        condoId: room.condoId,
        roomId: room.id,
        amount: new Prisma.Decimal(String(amount)),
        note,
        createdBy: ownerId ?? null,
      },
    });

    return res.status(201).json({
      ...created,
      amount: Number(created.amount),
    });
  } catch (err: any) {
    console.error("CREATE ADVANCE PAYMENT ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// DELETE /owner/advance-payments/:id
router.delete("/advance-payments/:id", async (req: any, res) => {
  try {
    const id = String(req.params.id);

    const item = await prisma.advancePayment.findUnique({
      where: { id },
      select: { roomId: true },
    });

    if (!item) return res.status(404).json({ error: "Not found" });

    await assertOwnerRoomOrThrow(req, item.roomId);

    await prisma.advancePayment.delete({ where: { id } });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE ADVANCE PAYMENT ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

/* =========================================================
   Monthly Contracts
   ========================================================= */

// GET /owner/rooms/:roomId/contracts
router.get("/rooms/:roomId/contracts", async (req: any, res) => {
  try {
    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const items = await prisma.roomContract.findMany({
      where: { roomId: room.id },
      orderBy: { startDate: "desc" },
    });

    return res.json(items.map((x) => ({
      ...x,
      rentPrice: Number(x.rentPrice),
      deposit: x.deposit ? Number(x.deposit) : null,
    })));
  } catch (err: any) {
    console.error("LIST CONTRACTS ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// POST /owner/rooms/:roomId/contracts
router.post("/rooms/:roomId/contracts", async (req: any, res) => {
  try {
    const ownerId = req.user?.id;

    const room = await assertOwnerRoomOrThrow(req, String(req.params.roomId));

    const tenantName = String(req.body?.tenantName ?? "").trim();
    const startDate = new Date(req.body?.startDate);
    const rentPrice = Number(req.body?.rentPrice);
    const deposit = Number(req.body?.deposit ?? 0);

    if (!tenantName) {
      return res.status(400).json({ error: "tenantName required" });
    }

    if (!Number.isFinite(rentPrice) || rentPrice <= 0) {
      return res.status(400).json({ error: "rentPrice invalid" });
    }

    const created = await prisma.roomContract.create({
      data: {
        condoId: room.condoId,
        roomId: room.id,
        tenantName,
        startDate,
        rentPrice: new Prisma.Decimal(String(rentPrice)),
        deposit: new Prisma.Decimal(String(deposit)),
        createdBy: ownerId ?? null,
      },
    });

    return res.status(201).json({
      ...created,
      rentPrice: Number(created.rentPrice),
      deposit: Number(created.deposit),
    });
  } catch (err: any) {
    console.error("CREATE CONTRACT ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});

// PATCH /owner/contracts/:contractId
router.patch("/contracts/:contractId", async (req: any, res) => {
  try {
    const id = String(req.params.contractId);

    const contract = await prisma.roomContract.findUnique({
      where: { id },
      select: { roomId: true },
    });

    if (!contract) return res.status(404).json({ error: "Not found" });

    await assertOwnerRoomOrThrow(req, contract.roomId);

    const rentPrice = Number(req.body?.rentPrice);
    const deposit = Number(req.body?.deposit);

    const updated = await prisma.roomContract.update({
      where: { id },
      data: {
        ...(Number.isFinite(rentPrice)
          ? { rentPrice: new Prisma.Decimal(String(rentPrice)) }
          : {}),
        ...(Number.isFinite(deposit)
          ? { deposit: new Prisma.Decimal(String(deposit)) }
          : {}),
      },
    });

    return res.json({
      ...updated,
      rentPrice: Number(updated.rentPrice),
      deposit: updated.deposit ? Number(updated.deposit) : null,
    });
  } catch (err: any) {
    console.error("UPDATE CONTRACT ERROR:", err);
    return res.status(err?.status ?? 500).json({ error: err?.message ?? "Failed" });
  }
});


export default router;