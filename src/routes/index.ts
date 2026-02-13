import { Router } from "express";
import usersRoutes from "./users.routes.js";
import ownerRoutes from "./owner.routes.js";
import adminRoutes from "./admin.routes.js";
import tenantRoutes from "./tenant.routes.js";
import authRoutes from "./auth.routes.js";

const router = Router();

router.use("/users", usersRoutes);
router.use("/admin", adminRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);
router.use("/auth", authRoutes);




export default router;
