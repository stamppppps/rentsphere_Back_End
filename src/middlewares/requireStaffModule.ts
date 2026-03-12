import type { RequestHandler } from "express";
import { prisma } from "../prisma.js";

export function requireStaffModule(moduleName: string): RequestHandler {
  return async (req: any, res, next) => {
    try {
      const user = req.user;

      if (!user) {
        return res.status(401).json({ error: "Unauthorized" });
      }

      // OWNER / ADMIN ผ่านได้เลย
      if (user.role === "OWNER" || user.role === "ADMIN") {
        return next();
      }

      // role อื่นที่ไม่ใช่ STAFF ไม่ให้ผ่าน
      if (user.role !== "STAFF") {
        return res.status(403).json({ error: "Forbidden" });
      }

      const condoId = String(
        req.params.condoId ||
          req.query.condoId ||
          req.body?.condoId ||
          ""
      ).trim();

      if (!condoId) {
        return res.status(400).json({ error: "condoId is required" });
      }

      const membership = await prisma.staffMembership.findFirst({
        where: {
          staffUserId: user.id,
          condoId,
          isActive: true,
        },
        select: {
          id: true,
          condoId: true,
          isActive: true,
          permissionOverrides: {
            where: { allowed: true },
            select: {
              permission: {
                select: {
                  module: true,
                  code: true,
                },
              },
            },
          },
        },
      });

      if (!membership) {
        return res.status(403).json({ error: "No condo access" });
      }

      const allowedModules = membership.permissionOverrides.map(
        (x) => x.permission.module
      );

      if (!allowedModules.includes(moduleName as any)) {
        return res.status(403).json({ error: "No permission" });
      }

      req.staffMembershipId = membership.id;
      req.allowedModules = allowedModules;
      req.condoId = condoId;

      return next();
    } catch (error) {
      return next(error);
    }
  };
}