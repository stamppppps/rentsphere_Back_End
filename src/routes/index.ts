import { Router } from "express";
import adminRoutes from "./admin.routes.js";
import authRoutes from "./auth.routes.js";
import facilityRoutes from "./facility.routes.js";
import lineRoutes from "./line.routes.js";
import ownerRoutes from "./owner.routes.js";
import staffInviteRoutes from "./staffInvite.routes.js";
import tenantFacilityRoutes from "./tenant-facility.routes.js";
import tenantRoutes from "./tenant.routes.js";
import usersRoutes from "./users.routes.js";

const router = Router();

router.use("/users", usersRoutes);
router.use("/admin", adminRoutes);
router.use("/line", lineRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);
router.use("/auth", authRoutes);
router.use("/staff-invites", staffInviteRoutes);
router.use("/facilities", facilityRoutes);
router.use("/tenant-public", tenantFacilityRoutes);



export default router;
