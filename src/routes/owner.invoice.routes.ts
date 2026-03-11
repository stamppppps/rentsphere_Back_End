import {
  Prisma,
  InvoiceItemType,
  InvoiceStatus,
  ContractStatus,
} from "@prisma/client";
import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";

const router = Router();

router.use(authRequired, requireRole(["OWNER"]));

/* =========================
   Helpers
========================= */

function parseMonthInput(raw: unknown) {
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

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function toDecimal(value: number) {
  return new Prisma.Decimal(String(value));
}

function safeInvoiceStatus(raw: unknown): InvoiceStatus {
  const s = String(raw ?? "").toUpperCase();
  if (s === "ISSUED") return InvoiceStatus.ISSUED;
  if (s === "PAID") return InvoiceStatus.PAID;
  if (s === "OVERDUE") return InvoiceStatus.OVERDUE;
  if (s === "CANCELLED") return InvoiceStatus.CANCELLED;
  return InvoiceStatus.DRAFT;
}

function buildDueDate(billingMonth: Date, dueDay?: number | null) {
  const year = billingMonth.getUTCFullYear();
  const month = billingMonth.getUTCMonth();
  const safeDay = Math.min(Math.max(Number(dueDay ?? 5), 1), 28);
  return new Date(Date.UTC(year, month, safeDay, 0, 0, 0, 0));
}

function makeInvoiceNo(roomNo: string, billingMonth: Date) {
  const y = billingMonth.getUTCFullYear();
  const m = String(billingMonth.getUTCMonth() + 1).padStart(2, "0");
  return `INV-${y}${m}-${roomNo}`;
}

async function assertOwnerCondoOrThrow(ownerId: string, condoId: string) {
  const condo = await prisma.condo.findFirst({
    where: { id: condoId, ownerUserId: ownerId },
    select: { id: true, nameTh: true, nameEn: true },
  });

  if (!condo) {
    const err: any = new Error("Forbidden");
    err.status = 403;
    throw err;
  }

  return condo;
}

async function findCycleForMonth(condoId: string, month: Date) {
  const { start, next } = getMonthRange(month);

  return prisma.meterCycle.findFirst({
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
}

/* =========================
   Types
========================= */

type PreviewItem = {
  itemType: InvoiceItemType;
  itemName: string;
  amount: number;
  condoChargeId?: string | null;
  extraChargeTemplateId?: string | null;
  meterReadingId?: string | null;
  facilityBookingId?: string | null;
};

type RoomPreview = {
  roomId: string;
  roomNo: string;
  contractId: string | null;
  items: PreviewItem[];
  subtotal: number;
  totalAmount: number;
  meterReadingId: string | null;
};

type PreviewRoomInput = {
  id: string;
  condoId: string;
  roomNo: string;
  rentPrice: Prisma.Decimal;
};

/* =========================
   Business helpers
========================= */

/**
 * สำคัญ:
 * Invoice.contractId FK -> RentalContract.id เท่านั้น
 * ห้ามเอา RoomContract.id มาใส่เด็ดขาด
 */
async function getRentForRoom(room: PreviewRoomInput) {
  // 1) ใช้ RentalContract ACTIVE ล่าสุดก่อน
  // เพราะเอา id ไปใส่ Invoice.contractId ได้จริง
  const rentalContract = await prisma.rentalContract.findFirst({
    where: {
      roomId: room.id,
      condoId: room.condoId,
      status: ContractStatus.ACTIVE,
    },
    orderBy: {
      moveInDate: "desc",
    },
    select: {
      id: true,
      monthlyRent: true,
    },
  });

  if (rentalContract) {
    return {
      contractId: rentalContract.id,
      amount: toNumber(rentalContract.monthlyRent),
      item: {
        itemType: "RENT" as InvoiceItemType,
        itemName: "ค่าเช่าห้อง",
        amount: toNumber(rentalContract.monthlyRent),
      },
    };
  }

  // 2) fallback RoomContract ล่าสุด
  // ใช้เฉพาะราคา แต่ห้ามใช้ id เป็น Invoice.contractId
  const roomContract = await prisma.roomContract.findFirst({
    where: {
      roomId: room.id,
      condoId: room.condoId,
    },
    orderBy: {
      startDate: "desc",
    },
    select: {
      id: true,
      rentPrice: true,
    },
  });

  if (roomContract) {
    return {
      contractId: null,
      amount: toNumber(roomContract.rentPrice),
      item: {
        itemType: "RENT" as InvoiceItemType,
        itemName: "ค่าเช่าห้อง",
        amount: toNumber(roomContract.rentPrice),
      },
    };
  }

  // 3) fallback room.rentPrice
  return {
    contractId: null,
    amount: toNumber(room.rentPrice),
    item: {
      itemType: "RENT" as InvoiceItemType,
      itemName: "ค่าเช่าห้อง",
      amount: toNumber(room.rentPrice),
    },
  };
}

async function getRoomExtraServiceItems(roomId: string): Promise<PreviewItem[]> {
  const rows = await prisma.roomExtraChargeAssignment.findMany({
    where: { roomId },
    include: {
      service: true,
      template: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => {
    const amount =
      row.template?.defaultAmount != null
        ? toNumber(row.template.defaultAmount)
        : toNumber(row.service.price);

    return {
      itemType: "EXTRA" as InvoiceItemType,
      itemName: row.service.name,
      amount,
      extraChargeTemplateId: row.templateId ?? null,
    };
  });
}

async function getRoomChargeItems(roomId: string): Promise<PreviewItem[]> {
  const rows = await prisma.roomCharge.findMany({
    where: {
      roomId,
      isEnabled: true,
    },
    include: {
      condoCharge: {
        include: {
          catalog: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  return rows.map((row) => ({
    itemType: "CHARGE" as InvoiceItemType,
    itemName: row.condoCharge.catalog.nameTh,
    amount:
      row.amountOverride != null
        ? toNumber(row.amountOverride)
        : toNumber(row.condoCharge.amount),
    condoChargeId: row.condoChargeId,
  }));
}

async function getMeterItemsForRoom(
  roomId: string,
  cycleId?: string | null,
  requireMeter = false
): Promise<{
  items: PreviewItem[];
  meterReadingId: string | null;
}> {
  if (!cycleId) {
    if (requireMeter) {
      const err: any = new Error("ยังไม่พบรอบมิเตอร์ของเดือนนี้");
      err.status = 400;
      throw err;
    }
    return { items: [], meterReadingId: null };
  }

  const reading = await prisma.meterReading.findUnique({
    where: {
      roomId_cycleId: {
        roomId,
        cycleId,
      },
    },
    select: {
      id: true,
      waterCharge: true,
      electricCharge: true,
    },
  });

  if (!reading) {
    if (requireMeter) {
      const err: any = new Error("ยังไม่จดมิเตอร์ครบทุกห้อง");
      err.status = 400;
      throw err;
    }
    return { items: [], meterReadingId: null };
  }

  return {
    meterReadingId: reading.id,
    items: [
      {
        itemType: "WATER" as InvoiceItemType,
        itemName: "ค่าน้ำ",
        amount: toNumber(reading.waterCharge),
        meterReadingId: reading.id,
      },
      {
        itemType: "ELECTRIC" as InvoiceItemType,
        itemName: "ค่าไฟ",
        amount: toNumber(reading.electricCharge),
        meterReadingId: reading.id,
      },
    ],
  };
}

async function buildPreviewForRoom(args: {
  room: PreviewRoomInput;
  cycleId?: string | null;
  requireMeter?: boolean;
}): Promise<RoomPreview> {
  const { room, cycleId, requireMeter = false } = args;

  const rent = await getRentForRoom(room);
  const roomCharges = await getRoomChargeItems(room.id);
  const extraServices = await getRoomExtraServiceItems(room.id);
  const meter = await getMeterItemsForRoom(room.id, cycleId, requireMeter);

  const items: PreviewItem[] = [
    rent.item,
    ...roomCharges,
    ...extraServices,
    ...meter.items,
  ];

  const subtotal = items.reduce((sum, item) => sum + toNumber(item.amount), 0);
  const totalAmount = subtotal;

  return {
    roomId: room.id,
    roomNo: room.roomNo,
    contractId: rent.contractId,
    items,
    subtotal,
    totalAmount,
    meterReadingId: meter.meterReadingId,
  };
}

/* =========================
   PREVIEW GENERATE
========================= */

router.get("/condos/:condoId/invoices/generate-preview", async (req: any, res) => {
  try {
    const ownerId = req.user?.id as string | undefined;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const condoId = String(req.params.condoId);
    await assertOwnerCondoOrThrow(ownerId, condoId);

    const billingMonth = parseMonthInput(req.query.month);
    const requireMeter = String(req.query.requireMeter ?? "false") === "true";

    const cycle = await findCycleForMonth(condoId, billingMonth);

    const rooms = await prisma.room.findMany({
      where: { condoId },
      orderBy: { roomNo: "asc" },
      select: {
        id: true,
        condoId: true,
        roomNo: true,
        rentPrice: true,
      },
    });

    const previews: RoomPreview[] = [];
    let grandTotal = 0;

    for (const room of rooms) {
      const preview = await buildPreviewForRoom({
        room,
        cycleId: cycle?.id ?? null,
        requireMeter,
      });

      previews.push(preview);
      grandTotal += preview.totalAmount;
    }

    res.json({
      ok: true,
      month: billingMonth,
      cycleId: cycle?.id ?? null,
      rooms: previews.map((r) => ({
        roomId: r.roomId,
        roomNo: r.roomNo,
        contractId: r.contractId,
        subtotal: r.subtotal,
        totalAmount: r.totalAmount,
        items: r.items,
      })),
      summary: {
        roomCount: previews.length,
        grandTotal,
      },
    });
  } catch (e: any) {
    console.error("INVOICE PREVIEW ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   GENERATE INVOICES
========================= */

router.post("/condos/:condoId/invoices/generate", async (req: any, res) => {
  try {
    const ownerId = req.user?.id as string | undefined;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const condoId = String(req.params.condoId);
    await assertOwnerCondoOrThrow(ownerId, condoId);

    const {
      month,
      roomIds,
      requireMeter = false,
      overwriteDraft = true,
      status = "DRAFT",
    } = req.body ?? {};

    const billingMonth = parseMonthInput(month);
    const cycle = await findCycleForMonth(condoId, billingMonth);
    const invoiceStatus = safeInvoiceStatus(status);

    const roomIdList =
      Array.isArray(roomIds) && roomIds.length > 0
        ? roomIds.map((x: unknown) => String(x))
        : null;

    const rooms = await prisma.room.findMany({
      where: {
        condoId,
        ...(roomIdList ? { id: { in: roomIdList } } : {}),
      },
      orderBy: { roomNo: "asc" },
      select: {
        id: true,
        condoId: true,
        roomNo: true,
        rentPrice: true,
      },
    });

    const billingSetting = await prisma.condoBillingSetting.findUnique({
      where: { condoId },
      select: { dueDay: true },
    });

    const dueDate = buildDueDate(billingMonth, billingSetting?.dueDay);

    const createdInvoices: Array<{
      invoiceId: string;
      invoiceNo: string;
      roomId: string;
      roomNo: string;
      totalAmount: number;
      status: InvoiceStatus;
    }> = [];

    for (const room of rooms) {
      const preview = await buildPreviewForRoom({
        room,
        cycleId: cycle?.id ?? null,
        requireMeter: Boolean(requireMeter),
      });

      const invoiceNo = makeInvoiceNo(room.roomNo, billingMonth);

      const saved = await prisma.$transaction(async (tx) => {
        const existing = await tx.invoice.findUnique({
          where: {
            roomId_billingMonth: {
              roomId: room.id,
              billingMonth,
            },
          },
          select: {
            id: true,
            status: true,
          },
        });

        if (existing && existing.status !== InvoiceStatus.DRAFT && !overwriteDraft) {
          const err: any = new Error(`ห้อง ${room.roomNo} มีใบแจ้งหนี้ที่ไม่ใช่ DRAFT อยู่แล้ว`);
          err.status = 400;
          throw err;
        }

        let invoiceId: string;
        const safeContractId = preview.contractId ?? null;

        if (!existing) {
          const created = await tx.invoice.create({
            data: {
              condoId,
              roomId: room.id,
              contractId: safeContractId,
              invoiceNo,
              billingMonth,
              status: invoiceStatus,
              issuedAt: invoiceStatus === InvoiceStatus.DRAFT ? null : new Date(),
              dueDate,
              subtotal: toDecimal(preview.subtotal),
              discountTotal: toDecimal(0),
              penaltyTotal: toDecimal(0),
              totalAmount: toDecimal(preview.totalAmount),
              note: null,
              createdBy: ownerId,
            },
            select: {
              id: true,
              invoiceNo: true,
              roomId: true,
              status: true,
              totalAmount: true,
            },
          });

          invoiceId = created.id;
        } else {
          const updated = await tx.invoice.update({
            where: {
              roomId_billingMonth: {
                roomId: room.id,
                billingMonth,
              },
            },
            data: {
              contractId: safeContractId,
              invoiceNo,
              status: invoiceStatus,
              issuedAt: invoiceStatus === InvoiceStatus.DRAFT ? null : new Date(),
              dueDate,
              subtotal: toDecimal(preview.subtotal),
              discountTotal: toDecimal(0),
              penaltyTotal: toDecimal(0),
              totalAmount: toDecimal(preview.totalAmount),
              note: null,
            },
            select: {
              id: true,
              invoiceNo: true,
              roomId: true,
              status: true,
              totalAmount: true,
            },
          });

          invoiceId = updated.id;

          await tx.invoiceItem.deleteMany({
            where: { invoiceId },
          });

          await tx.invoiceMeterLink.deleteMany({
            where: { invoiceId },
          });
        }

        if (preview.items.length > 0) {
          await tx.invoiceItem.createMany({
            data: preview.items.map((item) => ({
              invoiceId,
              itemType: item.itemType,
              itemName: item.itemName,
              amount: toDecimal(item.amount),
              condoChargeId: item.condoChargeId ?? null,
              extraChargeTemplateId: item.extraChargeTemplateId ?? null,
              meterReadingId: item.meterReadingId ?? null,
              facilityBookingId: item.facilityBookingId ?? null,
            })),
          });
        }

        if (cycle?.id) {
          await tx.invoiceMeterLink.create({
            data: {
              invoiceId,
              cycleId: cycle.id,
            },
          });
        }

        return tx.invoice.findUnique({
          where: { id: invoiceId },
          select: {
            id: true,
            invoiceNo: true,
            roomId: true,
            status: true,
            totalAmount: true,
          },
        });
      });

      if (saved) {
        createdInvoices.push({
          invoiceId: saved.id,
          invoiceNo: saved.invoiceNo,
          roomId: saved.roomId,
          roomNo: room.roomNo,
          totalAmount: toNumber(saved.totalAmount),
          status: saved.status,
        });
      }
    }

    res.status(201).json({
      ok: true,
      month: billingMonth,
      cycleId: cycle?.id ?? null,
      count: createdInvoices.length,
      invoices: createdInvoices,
      summary: {
        totalAmount: createdInvoices.reduce((sum, item) => sum + item.totalAmount, 0),
      },
    });
  } catch (e: any) {
    console.error("GENERATE INVOICES ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   LIST INVOICES BY MONTH
========================= */

router.get("/condos/:condoId/invoices", async (req: any, res) => {
  try {
    const ownerId = req.user?.id as string | undefined;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const condoId = String(req.params.condoId);
    await assertOwnerCondoOrThrow(ownerId, condoId);

    const billingMonth = parseMonthInput(req.query.month);
    const { start, next } = getMonthRange(billingMonth);

    const invoices = await prisma.invoice.findMany({
      where: {
        condoId,
        billingMonth: {
          gte: start,
          lt: next,
        },
      },
      include: {
        room: {
          select: {
            id: true,
            roomNo: true,
          },
        },
        items: true,
      },
      orderBy: [
        { billingMonth: "desc" },
        { room: { roomNo: "asc" } },
      ],
    });

    res.json({
      month: billingMonth,
      invoices: invoices.map((inv) => ({
        id: inv.id,
        invoiceNo: inv.invoiceNo,
        roomId: inv.roomId,
        roomNo: inv.room?.roomNo ?? "-",
        status: inv.status,
        billingMonth: inv.billingMonth,
        dueDate: inv.dueDate,
        subtotal: toNumber(inv.subtotal),
        discountTotal: toNumber(inv.discountTotal),
        penaltyTotal: toNumber(inv.penaltyTotal),
        totalAmount: toNumber(inv.totalAmount),
        itemCount: inv.items.length,
        createdAt: inv.createdAt,
      })),
      summary: {
        count: invoices.length,
        totalAmount: invoices.reduce((sum, inv) => sum + toNumber(inv.totalAmount), 0),
      },
    });
  } catch (e: any) {
    console.error("LIST INVOICES ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================
   GET INVOICE DETAIL
========================= */

router.get("/invoices/:invoiceId", async (req: any, res) => {
  try {
    const ownerId = req.user?.id as string | undefined;
    if (!ownerId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: String(req.params.invoiceId),
        condo: {
          ownerUserId: ownerId,
        },
      },
      include: {
        room: {
          select: {
            id: true,
            roomNo: true,
            floor: true,
          },
        },
        items: {
          orderBy: {
            createdAt: "asc",
          },
        },
        meterLinks: {
          include: {
            cycle: true,
          },
        },
        paymentNotices: {
          orderBy: {
            createdAt: "desc",
          },
        },
        paymentTxns: {
          orderBy: {
            createdAt: "desc",
          },
        },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    res.json({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      condoId: invoice.condoId,
      roomId: invoice.roomId,
      roomNo: invoice.room?.roomNo ?? "-",
      floor: invoice.room?.floor ?? null,
      contractId: invoice.contractId,
      billingMonth: invoice.billingMonth,
      dueDate: invoice.dueDate,
      status: invoice.status,
      subtotal: toNumber(invoice.subtotal),
      discountTotal: toNumber(invoice.discountTotal),
      penaltyTotal: toNumber(invoice.penaltyTotal),
      totalAmount: toNumber(invoice.totalAmount),
      note: invoice.note,
      createdAt: invoice.createdAt,
      items: invoice.items.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        itemName: item.itemName,
        amount: toNumber(item.amount),
        condoChargeId: item.condoChargeId,
        extraChargeTemplateId: item.extraChargeTemplateId,
        meterReadingId: item.meterReadingId,
        facilityBookingId: item.facilityBookingId,
      })),
      meterLinks: invoice.meterLinks.map((link) => ({
        id: link.id,
        cycleId: link.cycleId,
        cycleMonth: link.cycle?.cycleMonth ?? null,
      })),
      paymentNotices: invoice.paymentNotices.map((p) => ({
        id: p.id,
        paidAmount: toNumber(p.paidAmount),
        paidAt: p.paidAt,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
      })),
      paymentTransactions: invoice.paymentTxns.map((p) => ({
        id: p.id,
        amount: toNumber(p.amount),
        paidAt: p.paidAt,
        method: p.method,
        status: p.status,
        createdAt: p.createdAt,
      })),
    });
  } catch (e: any) {
    console.error("GET INVOICE DETAIL ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

export default router;