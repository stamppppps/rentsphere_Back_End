import { Router } from "express";
import usersRoutes from "./users.routes.js";
import ownerRoutes from "./owner.routes.js";
import adminRoutes from "./admin.routes.js";
import tenantRoutes from "./tenant.routes.js";


const router = Router();

router.use("/users", usersRoutes);
router.use("/admin", adminRoutes);
router.use("/owner", ownerRoutes);
router.use("/tenant", tenantRoutes);




export default router;
