import { Router } from "express";
import { mockAuth } from "../middlewares/mockAuth.js";
import { requireRole } from "../middlewares/requireRole.js";

const router = Router();

router.use(mockAuth, requireRole("TENANT"));

router.get("/me", (req, res) => {
  res.json({
    message: "TENANT OK",
    user: req.user,
  });
});

export default router;
