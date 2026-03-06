import { Router } from "express";
import usersRoutes from "./users.routes.js";
import ownerRoutes from "./owner.routes.js";
import adminRoutes from "./admin.routes.js";
import tenantRoutes from "./tenant.routes.js";
import authRoutes from "./auth.routes.js";
import staffInviteRoutes from "./staffInvite.routes.js";
import lineRoutes from "./line.routes.js";

const router = Router();

router.use("/users", usersRoutes);
router.use("/admin", adminRoutes);
router.use("/line", lineRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);
router.use("/auth", authRoutes);
router.use("/staff-invites", staffInviteRoutes);



export default router;
