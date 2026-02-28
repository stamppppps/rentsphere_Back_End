import { Router } from "express";
import { Prisma } from "@prisma/client";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { uploadMemory } from "../middlewares/uploadMemory.js";
import { prisma } from "../prisma.js";
import { cloudinary } from "../utils/cloudinary.js";

const router = Router();

router.use(authRequired, requireRole(["OWNER"]));

router.get("/me", async (req, res) => {
  res.json({ message: "OWNER OK", user: req.user });
});

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

function asOptionalMoneyNumber(v: any): number | null {
  if (v === undefined || v === null || String(v).trim() === "") return null;
  const raw = String(v).replace(/,/g, "").trim();
  const n = Number(raw);
  if (!Number.isFinite(n)) return null;
  return n;
}

function asRequiredTrimmedString(v: any, field: string): string | null {
  const s = asTrimmedString(v);
  return s ? s : null;
}

function asBankCode(v: any): string | null {
  const s = asTrimmedString(v);
  if (!s) return null;
  return s;
}

/* =========================
   POST /owner/condos/:condoId/logo
   ========================= */
router.post("/condos/:condoId/logo", uploadMemory.single("logo"), async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
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

   
    await prisma.$transaction(async (tx)=>{
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
    const ownerId = req.user?.id;
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
    const ownerId = req.user?.id;
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
   POST /owner/condos/:condoId/rooms
   ========================= */
router.post("/condos/:condoId/rooms", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const body = req.body ?? {};
    const roomNo = asTrimmedString(body.roomNo) ?? asTrimmedString(body.number);
    if (!roomNo) return res.status(400).json({ error: "roomNo (or number) is required (string)" });

    const floorNum = asOptionalInt(body.floor);
    if (floorNum === null) return res.status(400).json({ error: "floor is required (number)" });

    const rentRaw = body.rentPrice ?? body.price;
    const rentNum = asOptionalMoneyNumber(rentRaw);
    if (rentNum === null) return res.status(400).json({ error: "rentPrice (or price) is required" });

    const depositNum = asOptionalMoneyNumber(body.deposit);
    const sizeNum = asOptionalMoneyNumber(body.size);

   
    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

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
    return res.status(500).json({
      error: "Failed to create room",
      detail: String(err?.message ?? err),
    });
  }
});

/* =========================
   GET /owner/condos/:condoId/rooms
   ========================= */
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
  } catch (err: any) {
    console.error("LIST ROOMS ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch rooms" });
  }
});

// =========================
// Services (Additional fees)
// =========================
router.get("/condos/:condoId/services", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
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
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const body = req.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const price = Number(body.price);

    if (!name) return res.status(400).json({ error: "name is required" });
    if (!Number.isFinite(price) || price < 0)
      return res.status(400).json({ error: "price must be >= 0" });

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
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const serviceId = String(req.params.serviceId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    await prisma.condoService.delete({ where: { id: serviceId } });

    return res.json({ ok: true });
  } catch (err: any) {
    console.error("DELETE SERVICE ERROR:", err);
    return res.status(500).json({ error: "Failed to delete service" });
  }
});

// =========================
// Utilities (Water/Electric billing)
// =========================
router.get("/condos/:condoId/utilities", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    // check ownership
    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
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
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    // check ownership
    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const body = req.body ?? {};
    const utilityType = String(body.utilityType ?? "").toUpperCase(); // WATER | ELECTRIC
    const billingType = String(body.billingType ?? "").toUpperCase(); // METER | METER_MIN | FLAT
    const rate = Number(String(body.rate ?? "").replace(/,/g, "").trim());

    const okUtility = utilityType === "WATER" || utilityType === "ELECTRIC";
    const okBilling = billingType === "METER" || billingType === "METER_MIN" || billingType === "FLAT";

    if (!okUtility) return res.status(400).json({ error: "utilityType must be WATER|ELECTRIC" });
    if (!okBilling) return res.status(400).json({ error: "billingType must be METER|METER_MIN|FLAT" });
    if (!Number.isFinite(rate) || rate < 0) return res.status(400).json({ error: "rate must be >= 0" });

    // upsert by unique (condoId, utilityType)
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

// =========================
// GET /owner/condos/:condoId
// fetch condo by id (for step pages)
// =========================
router.get("/condos/:condoId", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      include: {
        billingSetting: true,
      },
    });

    if (!condo) return res.status(404).json({ error: "Condo not found" });

    return res.json(condo);
  } catch (err: any) {
    console.error("GET CONDO ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch condo" });
  }
});

// =========================
// Bank Accounts (Step3)
// =========================

// GET list
router.get("/condos/:condoId/bank-accounts", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
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

// POST create
router.post("/condos/:condoId/bank-accounts", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const bankCode = asBankCode(req.body?.bankCode);
    const accountName = asRequiredTrimmedString(req.body?.accountName, "accountName");
    const accountNo = asRequiredTrimmedString(req.body?.accountNo, "accountNo");

    if (!bankCode) return res.status(400).json({ error: "bankCode is required" });
    if (!accountName) return res.status(400).json({ error: "accountName is required" });
    if (!accountNo) return res.status(400).json({ error: "accountNo is required" });

    // optional: limit 2 accounts
    const count = await prisma.condoBankAccount.count({ where: { condoId } });
    if (count >= 2) return res.status(400).json({ error: "Max 2 bank accounts" });

    const created = await prisma.condoBankAccount.create({
      data: {
        condoId,
        bankCode,
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

// DELETE
router.delete("/condos/:condoId/bank-accounts/:accountId", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);
    const accountId = String(req.params.accountId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    // ensure account belongs to this condo
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


// Payment Instruction (message) (Step3)

router.get("/condos/:condoId/payment-instruction", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const row = await prisma.condoPaymentInstruction.findUnique({
      where: { condoId },
    });

    return res.json(row ?? { condoId, message: "" });
  } catch (err: any) {
    console.error("GET PAYMENT INSTRUCTION ERROR:", err);
    return res.status(500).json({ error: "Failed to fetch payment instruction" });
  }
});

router.put("/condos/:condoId/payment-instruction", async (req, res) => {
  try {
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

    const condoId = String(req.params.condoId);

    const condo = await prisma.condo.findFirst({
      where: { id: condoId, ownerUserId: ownerId },
      select: { id: true },
    });
    if (!condo) return res.status(403).json({ error: "Forbidden (not your condo)" });

    const message = asTrimmedString(req.body?.message) ?? "";
    if (message.length > 1000) {
      return res.status(400).json({ error: "message too long (max 1000 chars)" });
    }

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




export default router;