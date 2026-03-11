import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { prisma } from "../prisma.js";

const router = Router();

router.use(authRequired, requireRole(["ADMIN"]));

/* ==========================================
   GET /admin/platform-stats
   ดูสถิติ platform ทั้งหมด
   ========================================== */
router.get("/platform-stats", async (_req, res) => {
  try {
    // Count users by role
    const [totalUsers, owners, tenants, admins] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { role: "OWNER" } }),
      prisma.user.count({ where: { role: "TENANT" } }),
      prisma.user.count({ where: { role: "ADMIN" } }),
    ]);

    // Count condos, rooms, active contracts
    const [totalCondos, totalRooms, totalActiveContracts] = await Promise.all([
      prisma.condo.count(),
      prisma.room.count(),
      prisma.rentalContract.count({ where: { status: "ACTIVE" } }),
    ]);

    // Owner details with their condos
    const ownerUsers = await prisma.user.findMany({
      where: { role: "OWNER" },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        isActive: true,
        createdAt: true,
      },
    });

    const ownerDetails = await Promise.all(
      ownerUsers.map(async (owner) => {
        const condos = await prisma.condo.findMany({
          where: { ownerUserId: owner.id },
          select: {
            id: true,
            nameTh: true,
            nameEn: true,
            status: true,
            _count: { select: { rooms: true } },
          },
        });

        const condoInfos = condos.map((c) => ({
          id: c.id,
          name: c.nameTh ?? c.nameEn ?? "-",
          status: c.status ?? "ACTIVE",
          roomCount: c._count.rooms,
        }));

        return {
          id: owner.id,
          email: owner.email,
          name: owner.name,
          phone: owner.phone,
          isActive: owner.isActive,
          createdAt: owner.createdAt,
          condoCount: condos.length,
          totalRooms: condoInfos.reduce((sum, c) => sum + c.roomCount, 0),
          condos: condoInfos,
        };
      })
    );

    return res.json({
      summary: {
        totalUsers,
        owners,
        tenants,
        admins,
        totalCondos,
        totalRooms,
        totalActiveContracts,
      },
      owners: ownerDetails,
    });
  } catch (err: any) {
    console.error("ADMIN PLATFORM-STATS ERROR:", err);
    return res.status(500).json({ error: err?.message ?? "โหลดข้อมูลไม่สำเร็จ" });
  }
});

/* ==========================================
   DELETE /admin/condos/:condoId
   ลบคอนโด (cascade)
   ========================================== */
router.delete("/condos/:condoId", async (req, res) => {
  try {
    const { condoId } = req.params;

    const condo = await prisma.condo.findUnique({
      where: { id: condoId },
      select: { id: true, nameTh: true },
    });
    if (!condo) return res.status(404).json({ error: "ไม่พบคอนโด" });

    await prisma.condo.delete({ where: { id: condoId } });

    return res.json({ ok: true, message: `ลบคอนโด "${condo.nameTh}" เรียบร้อย` });
  } catch (err: any) {
    console.error("ADMIN DELETE CONDO ERROR:", err);
    return res.status(500).json({ error: err?.message ?? "ลบคอนโดไม่สำเร็จ" });
  }
});

/* ==========================================
   GET /admin/condos/:condoId/contracts
   ดูสัญญาทั้งหมดของคอนโด
   ========================================== */
router.get("/condos/:condoId/contracts", async (req, res) => {
  try {
    const { condoId } = req.params;

    const contracts = await prisma.rentalContract.findMany({
      where: { condoId },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        status: true,
        moveInDate: true,
        moveOutDate: true,
        monthlyRent: true,
        createdAt: true,
        room: { select: { id: true, roomNo: true } },
        tenant: { select: { id: true, name: true, email: true } },
      },
    });

    return res.json({
      items: contracts.map((c) => ({
        id: c.id,
        status: c.status,
        moveInDate: c.moveInDate,
        moveOutDate: c.moveOutDate,
        monthlyRent: c.monthlyRent,
        createdAt: c.createdAt,
        roomId: c.room?.id,
        roomNo: c.room?.roomNo,
        tenantName: c.tenant?.name ?? null,
        tenantEmail: c.tenant?.email ?? null,
      })),
    });
  } catch (err: any) {
    console.error("ADMIN CONTRACTS ERROR:", err);
    return res.status(500).json({ error: err?.message ?? "โหลดสัญญาไม่สำเร็จ" });
  }
});

/* ==========================================
   PATCH /admin/contracts/:contractId
   แก้ไขสัญญา (status, moveInDate, moveOutDate, monthlyRent)
   ========================================== */
router.patch("/contracts/:contractId", async (req, res) => {
  try {
    const { contractId } = req.params;
    const { status, moveInDate, moveOutDate, monthlyRent } = req.body;

    const existing = await prisma.rentalContract.findUnique({
      where: { id: contractId },
      select: { id: true },
    });
    if (!existing) return res.status(404).json({ error: "ไม่พบสัญญา" });

    const updated = await prisma.rentalContract.update({
      where: { id: contractId },
      data: {
        ...(status ? { status } : {}),
        ...(moveInDate ? { moveInDate: new Date(moveInDate) } : {}),
        ...(moveOutDate ? { moveOutDate: new Date(moveOutDate) } : {}),
        ...(monthlyRent !== undefined ? { monthlyRent: Number(monthlyRent) } : {}),
      },
      select: { id: true, status: true, moveInDate: true, moveOutDate: true, monthlyRent: true },
    });

    return res.json({ ok: true, contract: updated });
  } catch (err: any) {
    console.error("ADMIN EDIT CONTRACT ERROR:", err);
    return res.status(500).json({ error: err?.message ?? "แก้ไขสัญญาไม่สำเร็จ" });
  }
});

export default router;
