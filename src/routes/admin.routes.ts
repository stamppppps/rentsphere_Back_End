import { Router } from "express";
import { mockAuth } from "../middlewares/mockAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

router.use(mockAuth, requireRole("ADMIN"));

router.get("/me", (req, res) => {
  res.json({ message: "ADMIN OK", user: req.user });
});

export default router;
