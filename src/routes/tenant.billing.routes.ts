import { InvoiceStatus } from "@prisma/client";
import { Router } from "express";
import { prisma } from "../prisma.js";
import { uploadMemory } from "../middlewares/uploadMemory.js";
import { verifySlipWithSlipOK } from "../utils/slipok.js";

const router = Router();

function toNumber(value: unknown) {
  const n = Number(value ?? 0);
  return Number.isFinite(n) ? n : 0;
}

function mapTenantBillStatus(args: {
  invoiceStatus: InvoiceStatus;
  latestPaymentTxnStatus?: string | null;
}): "UNPAID" | "PENDING_REVIEW" | "PAID" | "OVERDUE" {
  const { invoiceStatus, latestPaymentTxnStatus } = args;

  if (invoiceStatus === InvoiceStatus.PAID) return "PAID";
  if (invoiceStatus === InvoiceStatus.OVERDUE) return "OVERDUE";

  const latestTxn = String(latestPaymentTxnStatus ?? "").toUpperCase();
  if (latestTxn && latestTxn !== "CONFIRMED") return "PENDING_REVIEW";

  return "UNPAID";
}

function mapBillItemKey(
  itemType: string,
  itemName: string
): "rent" | "water" | "electricity" | "commonFee" | "other" {
  const type = String(itemType || "").toUpperCase();
  const name = String(itemName || "").toLowerCase();

  if (type === "RENT" || name.includes("เช่า")) return "rent";
  if (type === "WATER" || name.includes("น้ำ")) return "water";
  if (type === "ELECTRIC" || name.includes("ไฟ")) return "electricity";
  if (type === "CHARGE" || type === "EXTRA" || name.includes("ส่วนกลาง")) return "commonFee";

  return "other";
}

async function getResidencyByLineUserIdOrThrow(lineUserId: string) {
  const lineAcc = await prisma.lineAccount.findUnique({
    where: { lineUserId },
    select: { userId: true },
  });

  if (!lineAcc?.userId) {
    const err: any = new Error("ไม่พบบัญชี LINE นี้ในระบบ");
    err.status = 404;
    throw err;
  }

  const residency = await prisma.tenantResidency.findFirst({
    where: {
      tenantUserId: lineAcc.userId,
      status: "ACTIVE",
    },
    orderBy: { startDate: "desc" },
    select: {
      condoId: true,
      roomId: true,
      room: {
        select: {
          roomNo: true,
          floor: true,
        },
      },
      condo: {
        select: {
          nameTh: true,
          nameEn: true,
        },
      },
    },
  });

  if (!residency) {
    const err: any = new Error("ไม่พบข้อมูลการเข้าพัก");
    err.status = 404;
    throw err;
  }

  return residency;
}

/* CURRENT */
router.get("/current", async (req, res) => {
  try {
    const lineUserId = String(req.query.lineUserId || "").trim();
    if (!lineUserId) {
      return res.status(400).json({ error: "lineUserId is required" });
    }

    const residency = await getResidencyByLineUserIdOrThrow(lineUserId);

    const invoice = await prisma.invoice.findFirst({
      where: {
        roomId: residency.roomId,
        condoId: residency.condoId,
        status: { not: "CANCELLED" as any },
      },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        paymentTxns: {
          orderBy: { createdAt: "desc" },
          take: 1,
        },
      },
      orderBy: [{ billingMonth: "desc" }, { createdAt: "desc" }],
    });

    if (!invoice) {
      return res.status(404).json({ error: "ไม่พบบิลปัจจุบัน" });
    }

    const latestTxn = invoice.paymentTxns?.[0];

    res.json({
      billId: invoice.id,
      invoiceNo: invoice.invoiceNo,
      status: mapTenantBillStatus({
        invoiceStatus: invoice.status,
        latestPaymentTxnStatus: latestTxn?.status ?? null,
      }),
      total: toNumber(invoice.totalAmount),
      dueDate: invoice.dueDate,
      billingMonth: invoice.billingMonth,
      roomNo: residency.room?.roomNo ?? "-",
      condoName: residency.condo?.nameTh ?? residency.condo?.nameEn ?? "RentSphere",
      items: invoice.items.map((item) => ({
        id: item.id,
        key: mapBillItemKey(item.itemType, item.itemName),
        label: item.itemName,
        amount: toNumber(item.amount),
        itemType: item.itemType,
      })),
    });
  } catch (e: any) {
    console.error("TENANT BILL CURRENT ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* HISTORY */
router.get("/history", async (req, res) => {
  try {
    const lineUserId = String(req.query.lineUserId || "").trim();
    if (!lineUserId) {
      return res.status(400).json({ error: "lineUserId is required" });
    }

    const residency = await getResidencyByLineUserIdOrThrow(lineUserId);

    const invoices = await prisma.invoice.findMany({
      where: {
        roomId: residency.roomId,
        condoId: residency.condoId,
      },
      include: {
        paymentTxns: { orderBy: { createdAt: "desc" } },
      },
      orderBy: [{ billingMonth: "desc" }, { createdAt: "desc" }],
    });

    res.json({
      history: invoices.map((invoice) => {
        const latestTxn = invoice.paymentTxns?.[0];
        return {
          id: invoice.id,
          invoiceNo: invoice.invoiceNo,
          monthText: new Date(invoice.billingMonth).toLocaleDateString("th-TH", {
            month: "long",
            year: "numeric",
          }),
          amount: toNumber(invoice.totalAmount),
          status:
            mapTenantBillStatus({
              invoiceStatus: invoice.status,
              latestPaymentTxnStatus: latestTxn?.status ?? null,
            }) === "PAID"
              ? "PAID"
              : "PENDING_REVIEW",
          paidAtISO:
            latestTxn?.paidAt?.toISOString?.() ??
            invoice.createdAt.toISOString(),
        };
      }),
    });
  } catch (e: any) {
    console.error("TENANT BILL HISTORY ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* DETAIL */
router.get("/:invoiceId", async (req, res) => {
  try {
    const lineUserId = String(req.query.lineUserId || "").trim();
    if (!lineUserId) {
      return res.status(400).json({ error: "lineUserId is required" });
    }

    const residency = await getResidencyByLineUserIdOrThrow(lineUserId);

    const invoice = await prisma.invoice.findFirst({
      where: {
        id: String(req.params.invoiceId),
        roomId: residency.roomId,
        condoId: residency.condoId,
      },
      include: {
        items: { orderBy: { createdAt: "asc" } },
        paymentTxns: { orderBy: { createdAt: "desc" } },
      },
    });

    if (!invoice) {
      return res.status(404).json({ error: "ไม่พบใบแจ้งหนี้" });
    }

    const latestTxn = invoice.paymentTxns?.[0];

    res.json({
      id: invoice.id,
      invoiceNo: invoice.invoiceNo,
      roomNo: residency.room?.roomNo ?? "-",
      status: mapTenantBillStatus({
        invoiceStatus: invoice.status,
        latestPaymentTxnStatus: latestTxn?.status ?? null,
      }),
      billingMonth: invoice.billingMonth,
      dueDate: invoice.dueDate,
      subtotal: toNumber(invoice.subtotal),
      discountTotal: toNumber(invoice.discountTotal),
      penaltyTotal: toNumber(invoice.penaltyTotal),
      totalAmount: toNumber(invoice.totalAmount),
      createdAt: invoice.createdAt,
      items: invoice.items.map((item) => ({
        id: item.id,
        itemType: item.itemType,
        itemName: item.itemName,
        amount: toNumber(item.amount),
        key: mapBillItemKey(item.itemType, item.itemName),
      })),
      payments: invoice.paymentTxns.map((p) => ({
        id: p.id,
        amount: toNumber(p.amount),
        method: p.method,
        status: p.status,
        paidAt: p.paidAt,
        createdAt: p.createdAt,
      })),
    });
  } catch (e: any) {
    console.error("TENANT BILL DETAIL ERROR:", e);
    res.status(e.status ?? 500).json({ error: e.message });
  }
});

/* =========================================================
   VERIFY SLIP  —  POST /:invoiceId/verify-slip
   รับ multipart/form-data field "slip" (image)
   ส่งไป SlipOK → ถ้าผ่าน อัพเดท invoice => PAID
   ========================================================= */
router.post(
  "/:invoiceId/verify-slip",
  uploadMemory.single("slip"),
  async (req: any, res) => {
    try {
      const invoiceId = String(req.params.invoiceId || "").trim();
      if (!invoiceId) {
        return res.status(400).json({ success: false, error: "invoiceId is required" });
      }

      const file = req.file;
      if (!file || !file.buffer) {
        return res.status(400).json({ success: false, error: "กรุณาแนบรูปสลิป" });
      }

      // Find the invoice
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        select: {
          id: true,
          invoiceNo: true,
          totalAmount: true,
          status: true,
          roomId: true,
          condoId: true,
          room: { select: { roomNo: true } },
        },
      });

      if (!invoice) {
        return res.status(404).json({ success: false, error: "ไม่พบใบแจ้งหนี้" });
      }

      if (invoice.status === "PAID") {
        return res.status(400).json({ success: false, error: "ใบแจ้งหนี้นี้ชำระแล้ว" });
      }

      // Verify with SlipOK
      console.log("=== WEB SLIP VERIFICATION START ===");
      console.log(`invoiceId=${invoiceId}, invoiceNo=${invoice.invoiceNo}`);

      const slipResult = await verifySlipWithSlipOK(file.buffer);
      console.log("SlipOK result:", JSON.stringify(slipResult));

      if (slipResult.success) {
        const transferAmount = Number(slipResult.data?.amount || slipResult.data?.transAmount || 0);
        const invoiceAmount = Number(invoice.totalAmount);
        const transferFrom = slipResult.data?.sender?.name || slipResult.data?.sendingBank || null;
        const transRef = slipResult.data?.transRef || null;

        // ตรวจสอบยอดเงิน: ต้องโอนมาตรงหรือมากกว่ายอดใบแจ้งหนี้
        if (transferAmount > 0 && transferAmount < invoiceAmount) {
          const diff = invoiceAmount - transferAmount;
          console.log(`=== WEB SLIP AMOUNT MISMATCH: transfer=${transferAmount}, invoice=${invoiceAmount} ===`);
          return res.json({
            success: false,
            error: `ยอดโอนไม่ตรง — ต้องชำระ ฿${invoiceAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} แต่โอนมา ฿${transferAmount.toLocaleString("en-US", { minimumFractionDigits: 2 })} (ขาดอีก ฿${diff.toLocaleString("en-US", { minimumFractionDigits: 2 })})`,
            slipData: {
              transferAmount,
              invoiceAmount,
              difference: diff,
              transferFrom,
              transRef,
            },
          });
        }

        // ยอดตรงหรือมากกว่า → อัพเดท invoice เป็น PAID
        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: "PAID" as any },
        });

        // Create payment transaction record
        await prisma.paymentTransaction.create({
          data: {
            invoiceId: invoice.id,
            condoId: invoice.condoId,
            amount: invoice.totalAmount,
            method: "TRANSFER" as any,
            status: "CONFIRMED" as any,
            paidAt: new Date(),
          },
        });

        console.log("=== WEB SLIP VERIFICATION COMPLETE - PAID ===");

        return res.json({
          success: true,
          invoiceNo: invoice.invoiceNo,
          roomNo: invoice.room?.roomNo ?? "-",
          totalAmount: invoiceAmount,
          slipData: {
            transferAmount: transferAmount || null,
            transferFrom,
            transRef,
          },
        });
      } else {
        console.log("=== WEB SLIP VERIFICATION COMPLETE - FAILED ===");

        return res.json({
          success: false,
          error: slipResult.error || "ตรวจ slip ไม่สำเร็จ",
        });
      }
    } catch (err: any) {
      console.error("WEB SLIP VERIFY ERROR:", err);
      return res.status(500).json({
        success: false,
        error: err?.message || "เกิดข้อผิดพลาดในการตรวจสอบ slip",
      });
    }
  }
);

export default router;