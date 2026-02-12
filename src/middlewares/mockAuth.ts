import { Request, Response, NextFunction } from "express";

type Role = "ADMIN" | "OWNER" | "TENANT";

// ส่ง header: x-mock-user: OWNER:owner_1
// หรือ            TENANT:tenant_1
export function mockAuth(req: Request, res: Response, next: NextFunction) {
  const raw = req.header("x-mock-user") || "OWNER:owner_1";

  const [roleRaw, idRaw] = raw.split(":");
  const role = roleRaw as Role;
  const id = idRaw || "owner_1";

  const ok = role === "ADMIN" || role === "OWNER" || role === "TENANT";
  if (!ok) return res.status(400).json({ message: "Invalid x-mock-user role" });

  req.user = {
    id: idRaw || "cmkulzfpy0001s1tgs9xfuxaa",
    email: "owner@rentsphere.com",
    role: "OWNER",
  };

  next();
}
