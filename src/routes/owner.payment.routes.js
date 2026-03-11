import { PaymentMethod, PaymentTxnStatus, InvoiceStatus } from "@prisma/client";
import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";
const router = Router();
router.use(authRequired, requireRole(["OWNER"]));
function toNumber(value) {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
}
function parsePaidAt(raw) {
    if (!raw)
        return new Date();
    const s = String(raw).trim();
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
        const [dd, mm, yyyy] = s.split("/").map(Number);
        return new Date(Date.UTC(yyyy, mm - 1, dd, 0, 0, 0, 0));
    }
    const dt = new Date(s);
    if (!Number.isNaN(dt.getTime()))
        return dt;
    return new Date();
}
function mapPaymentMethod(raw) {
    const s = String(raw ?? "").trim().toUpperCase();
    if (s === "CASH" || s === "เงินสด")
        return PaymentMethod.CASH;
    if (s === "TRANSFER" || s === "เงินโอน")
        return PaymentMethod.TRANSFER;
    if (s === "PROMPTPAY" || s === "พร้อมเพย์")
        return PaymentMethod.PROMPTPAY;
    return PaymentMethod.CASH;
}
router.post("/invoices/:invoiceId/payments", async (req, res) => {
    try {
        const ownerId = req.user?.id;
        if (!ownerId) {
            return res.status(401).json({ error: "Unauthorized" });
        }
        const invoiceId = String(req.params.invoiceId);
        const amount = toNumber(req.body?.amount);
        const method = mapPaymentMethod(req.body?.method);
        const paidAt = parsePaidAt(req.body?.paidAt);
        if (amount <= 0) {
            return res.status(400).json({ error: "amount must be greater than 0" });
        }
        const invoice = await prisma.invoice.findFirst({
            where: {
                id: invoiceId,
                condo: {
                    ownerUserId: ownerId,
                },
            },
            select: {
                id: true,
                condoId: true,
                roomId: true,
                totalAmount: true,
                status: true,
            },
        });
        if (!invoice) {
            return res.status(404).json({ error: "Invoice not found" });
        }
        if (invoice.status === InvoiceStatus.CANCELLED) {
            return res.status(400).json({ error: "Invoice ถูกยกเลิกแล้ว" });
        }
        const invoiceTotal = toNumber(invoice.totalAmount);
        const result = await prisma.$transaction(async (tx) => {
            const payment = await tx.paymentTransaction.create({
                data: {
                    condoId: invoice.condoId,
                    invoiceId: invoice.id,
                    amount,
                    method,
                    paidAt,
                    status: PaymentTxnStatus.CONFIRMED,
                    confirmedBy: ownerId,
                    confirmedAt: new Date(),
                },
                select: {
                    id: true,
                    amount: true,
                    method: true,
                    paidAt: true,
                    status: true,
                    confirmedAt: true,
                },
            });
            const allPayments = await tx.paymentTransaction.findMany({
                where: {
                    invoiceId: invoice.id,
                    status: PaymentTxnStatus.CONFIRMED,
                },
                select: {
                    amount: true,
                },
            });
            const paidTotal = allPayments.reduce((sum, p) => sum + toNumber(p.amount), 0);
            const nextInvoiceStatus = paidTotal >= invoiceTotal ? InvoiceStatus.PAID : InvoiceStatus.ISSUED;
            const updatedInvoice = await tx.invoice.update({
                where: { id: invoice.id },
                data: {
                    status: nextInvoiceStatus,
                },
                select: {
                    id: true,
                    status: true,
                    totalAmount: true,
                },
            });
            return {
                payment,
                invoice: updatedInvoice,
                summary: {
                    invoiceTotal,
                    paidTotal,
                    remainingAmount: Math.max(0, invoiceTotal - paidTotal),
                },
            };
        });
        res.status(201).json({
            ok: true,
            payment: {
                id: result.payment.id,
                amount: toNumber(result.payment.amount),
                method: result.payment.method,
                paidAt: result.payment.paidAt,
                status: result.payment.status,
                confirmedAt: result.payment.confirmedAt,
            },
            invoice: {
                id: result.invoice.id,
                status: result.invoice.status,
                totalAmount: toNumber(result.invoice.totalAmount),
            },
            summary: result.summary,
        });
    }
    catch (e) {
        console.error("CREATE PAYMENT TRANSACTION ERROR:", e);
        res.status(e.status ?? 500).json({ error: e.message });
    }
});
export default router;
