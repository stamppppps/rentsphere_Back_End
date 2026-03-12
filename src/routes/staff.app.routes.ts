import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { requireStaffModule } from "../middlewares/requireStaffModule.js";

const router = Router();

/*
  route ชุดนี้เป็น route กลางสำหรับ staff app
  ตอนนี้ทำเป็น skeleton สำหรับทดสอบ permission ก่อน
  ภายหลังค่อยเปลี่ยนให้เรียก service / handler จริงของแต่ละหน้าได้
*/

router.use(authRequired, requireRole(["STAFF", "OWNER", "ADMIN"]));

router.get(
  "/dashboard",
  requireStaffModule("DASHBOARD"),
  async (req, res) => {
    return res.json({
      ok: true,
      module: "DASHBOARD",
      condoId: (req as any).condoId ?? null,
      allowedModules: (req as any).allowedModules ?? [],
    });
  }
);

router.get("/rooms", requireStaffModule("ROOMS"), async (req, res) => {
  return res.json({
    ok: true,
    module: "ROOMS",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/repairs", requireStaffModule("REPAIR"), async (req, res) => {
  return res.json({
    ok: true,
    module: "REPAIR",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/parcels", requireStaffModule("PARCEL"), async (req, res) => {
  return res.json({
    ok: true,
    module: "PARCEL",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/facilities", requireStaffModule("FACILITY"), async (req, res) => {
  return res.json({
    ok: true,
    module: "FACILITY",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/meter", requireStaffModule("METER"), async (req, res) => {
  return res.json({
    ok: true,
    module: "METER",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/billing", requireStaffModule("BILLING"), async (req, res) => {
  return res.json({
    ok: true,
    module: "BILLING",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/payments", requireStaffModule("PAYMENT"), async (req, res) => {
  return res.json({
    ok: true,
    module: "PAYMENT",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

router.get("/reports", requireStaffModule("REPORTS"), async (req, res) => {
  return res.json({
    ok: true,
    module: "REPORTS",
    condoId: (req as any).condoId ?? null,
    allowedModules: (req as any).allowedModules ?? [],
  });
});

export default router;