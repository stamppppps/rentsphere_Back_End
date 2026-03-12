import { Router } from "express";
import usersRoutes from "./users.routes.js";
import ownerRoutes from "./owner.routes.js";
import adminRoutes from "./admin.routes.js";
import tenantRoutes from "./tenant.routes.js";
import authRoutes from "./auth.routes.js";
import staffInviteRoutes from "./staffInvite.routes.js";
import lineRoutes from "./line.routes.js";
import ownerMeterRoutes from "./owner.meter.routes.js";
import ownerInvoiceRoutes from "./owner.invoice.routes.js";
import ownerPaymentRoutes from "./owner.payment.routes.js";
import tenantBillingRoutes from "./tenant.billing.routes.js";
import staffAppRoutes from "./staff.app.routes.js";

const router = Router();

router.use("/users", usersRoutes);
router.use("/admin", adminRoutes);
router.use("/line", lineRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);
router.use("/auth", authRoutes);
router.use("/staff-invites", staffInviteRoutes);

router.use("/owner", ownerMeterRoutes);
router.use("/owner", ownerInvoiceRoutes);
router.use("/owner", ownerPaymentRoutes);
router.use("/tenant-billing", tenantBillingRoutes);

// staff app permission test routes
router.use("/staff-app", staffAppRoutes);
export default router;