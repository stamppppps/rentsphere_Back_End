import { Request, Response, NextFunction } from "express";

/**
 * Mock Authentication (DEV ONLY)
 * ไว้ให้ backend เดินได้ก่อน
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // mock user
  req.user = {
    id: "owner-demo-id",
    email: "owner@demo.com",
    role: "OWNER", // ลอง OWNER ก่อน
  } as any;

  next();
}
