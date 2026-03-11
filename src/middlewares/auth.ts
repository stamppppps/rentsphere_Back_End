import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

declare global{
  namespace Express{
    interface Request{
      user?: { id: string;role: string };
    }
  }
}

export function authRequired(req: Request, res: Response, next: NextFunction) {
  const authHeader = typeof req.headers.authorization === "string" ? req.headers.authorization.trim() : "";
  const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader);
  const bearerToken = bearerMatch?.[1]?.trim() || "";
  const rawAuthToken = bearerToken ? "" : authHeader;
  const headerToken = typeof req.headers["x-access-token"] === "string" ? req.headers["x-access-token"].trim() : "";
  const cookieToken =
    typeof req.cookies?.token === "string"
      ? req.cookies.token.trim()
      : typeof req.cookies?.accessToken === "string"
        ? req.cookies.accessToken.trim()
        : "";
  const token = bearerToken || rawAuthToken || headerToken || cookieToken;

  if (!token) return res.status(401).json({ error: "Missing token" });

  try {
    const secret = process.env.JWT_SECRET!;
    const decoded = jwt.verify(token, secret) as { id: string; role: string };
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch {
    return res.status(401).json({ error: "Invalid token" });
  }
}
