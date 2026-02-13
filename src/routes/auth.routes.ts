import { Router } from "express";
import bcrypt from "bcrypt";
//import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { authRequired } from "../middlewares/auth.js";
import { randomOtp6, randomToken, sha256 } from "../utils/verify.js";
import { sendVerifyEmail } from "../utils/mailer.js";

const router = Router();



import jwt, { type Secret, type SignOptions } from "jsonwebtoken";

function parseExpiresInSeconds(v?: string): number {
  // รองรับ: "7d", "24h", "30m", "120s", หรือ "604800"
  if (!v) return 7 * 24 * 60 * 60;

  const raw = v.trim();

  // ถ้าเป็นตัวเลขล้วน -> ถือว่าเป็นวินาที
  if (/^\d+$/.test(raw)) return Number(raw);

  const m = raw.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60;

  const n = Number(m[1]);
  const unit = m[2].toLowerCase();

  const mul =
    unit === "s" ? 1 :
    unit === "m" ? 60 :
    unit === "h" ? 3600 :
    86400; // d

  return n * mul;
}

function signToken(payload: { id: string; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");

  const expiresInSeconds = parseExpiresInSeconds(process.env.JWT_EXPIRES_IN ?? "7d");
  const options: SignOptions = { expiresIn: expiresInSeconds };

  return jwt.sign(payload, secret as Secret, options);
}






// ===============================
// B) REGISTER FLOW (OWNER only)
// ===============================

// 1) START: สร้าง registerRequest + ส่ง OTP (dev) + ส่ง email link
router.post("/register/start", async (req, res) => {
  try {
    const { name, email, phone, role } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      role?: "OWNER" | "TENANT" | "ADMIN";
    };

    if (!email || !phone || !role) {
      return res.status(400).json({ error: "email, phone, role is required" });
    }

    // ตอนนี้ให้สมัครเองได้เฉพาะ OWNER
    if (role !== "OWNER") {
      return res.status(403).json({ error: "Only OWNER can start register" });
    }

    const cleanEmail = String(email).trim().toLowerCase();
    const cleanPhone = String(phone).trim();

    // กัน email ซ้ำ (มี user แล้ว)
    const existedUser = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existedUser) return res.status(409).json({ error: "Email already exists" });

    // กัน request ซ้ำ (เผลอกดหลายรอบ) -> ลบของเก่าทิ้งหรืออัปเดต
    const existedReq = await prisma.registerRequest.findUnique({ where: { email: cleanEmail } });
    if (existedReq) {
      // ลบทิ้งแล้วสร้างใหม่ให้ flow ง่าย (หรือจะ update ก็ได้)
      await prisma.registerRequest.delete({ where: { email: cleanEmail } }).catch(() => {});
    }

    const otp = randomOtp6();
    const otpHash = sha256(otp);

    const emailToken = randomToken();
    const emailTokenHash = sha256(emailToken);

    const otpExpiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 นาที
    const emailTokenExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 นาที

    const request = await prisma.registerRequest.create({
      data: {
        role,
        name: name?.trim() || null,
        email: cleanEmail,
        phone: cleanPhone,
        otpHash,
        otpExpiresAt,
        emailTokenHash,
        emailTokenExpiresAt,
      },
      select: { id: true, email: true, phone: true, otpExpiresAt: true, emailTokenExpiresAt: true },
    });

    // ✅ ส่ง OTP (ตอน dev: log)
    console.log("📲 OTP (dev):", otp, "for", cleanPhone);

   
    const appUrl = process.env.APP_URL || "http://localhost:5174";
    // หน้า FE ที่ไว้โชว์ผล verify (แนะนำให้ FE ทำหน้า /auth/owner/verify-email)
    const verifyLink = `${appUrl}/auth/owner/verify-email?token=${emailToken}`;

    await sendVerifyEmail(cleanEmail, verifyLink);

    return res.status(201).json({
      requestId: request.id,
      otpExpiresAt: request.otpExpiresAt,
      emailTokenExpiresAt: request.emailTokenExpiresAt,
      message: "OTP sent and email verification link sent",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Start register failed" });
  }
});

// 2) VERIFY OTP
router.post("/register/verify-otp", async (req, res) => {
  try {
    const { requestId, otp } = req.body as { requestId?: string; otp?: string };
    if (!requestId || !otp) {
      return res.status(400).json({ error: "requestId and otp is required" });
    }

    const reqRow = await prisma.registerRequest.findUnique({ where: { id: requestId } });
    if (!reqRow) return res.status(404).json({ error: "Request not found" });

    if (reqRow.otpVerifiedAt) return res.json({ ok: true });

    if (new Date() > reqRow.otpExpiresAt) {
      return res.status(400).json({ error: "OTP expired" });
    }

    const ok = sha256(String(otp)) === reqRow.otpHash;
    if (!ok) return res.status(401).json({ error: "Invalid OTP" });

    await prisma.registerRequest.update({
      where: { id: requestId },
      data: { otpVerifiedAt: new Date() },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Verify OTP failed" });
  }
});

// 3) VERIFY EMAIL (ลิงก์จากอีเมล)
// - ทำเป็น redirect กลับ FE ให้สวย ๆ
router.get("/register/verify-email", async (req, res) => {
  try {
    const token = String(req.query.token || "");
    if (!token) return res.status(400).send("Missing token");

    const tokenHash = sha256(token);

    const reqRow = await prisma.registerRequest.findFirst({
      where: { emailTokenHash: tokenHash },
    });
    if (!reqRow) {
      const appUrl = process.env.APP_URL || "http://localhost:5174";
      return res.redirect(`${appUrl}/auth/owner/verify-email?status=invalid`);
    }

    const appUrl = process.env.APP_URL || "http://localhost:5174";

    if (reqRow.emailVerifiedAt) {
      return res.redirect(`${appUrl}/auth/owner/verify-email?status=already`);
    }

    if (new Date() > reqRow.emailTokenExpiresAt) {
      return res.redirect(`${appUrl}/auth/owner/verify-email?status=expired`);
    }

    await prisma.registerRequest.update({
      where: { id: reqRow.id },
      data: { emailVerifiedAt: new Date() },
    });

    return res.redirect(`${appUrl}/auth/owner/verify-email?status=ok`);
  } catch (e) {
    console.error(e);
    return res.status(500).send("Verify email failed");
  }
});

// 4) COMPLETE: สร้าง user จริง หลัง otp+email ผ่านแล้ว
router.post("/register/complete", async (req, res) => {
  try {
    const { requestId, password } = req.body as { requestId?: string; password?: string };
    if (!requestId || !password) {
      return res.status(400).json({ error: "requestId and password is required" });
    }

    const reqRow = await prisma.registerRequest.findUnique({ where: { id: requestId } });
    if (!reqRow) return res.status(404).json({ error: "Request not found" });

    if (reqRow.role !== "OWNER") {
      return res.status(403).json({ error: "Only OWNER can complete register" });
    }

    if (!reqRow.otpVerifiedAt) return res.status(400).json({ error: "OTP not verified" });
    if (!reqRow.emailVerifiedAt) return res.status(400).json({ error: "Email not verified" });

    // กันสร้างซ้ำ
    const existed = await prisma.user.findUnique({ where: { email: reqRow.email } });
    if (existed) return res.status(409).json({ error: "Email already exists" });

    const passwordHash = await bcrypt.hash(password, 10);

    const user = await prisma.user.create({
      data: {
        email: reqRow.email,
        passwordHash,
        name: reqRow.name || null,
        phone: reqRow.phone || null,
        role: reqRow.role,
      },
      select: { id: true, email: true, name: true, phone: true, role: true },
    });

    const token = signToken({ id: user.id, role: user.role });

    // ล้าง request ทิ้งได้
    await prisma.registerRequest.delete({ where: { id: requestId } }).catch(() => {});

    return res.status(201).json({ user, token });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Complete register failed" });
  }
});

// ===============================
// LOGIN
// ===============================
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    if (!email || !password) {
      return res.status(400).json({ error: "email and password is required" });
    }

    const cleanEmail = String(email).trim().toLowerCase();

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const token = signToken({ id: user.id, role: user.role });

    return res.json({
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
      token,
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Login failed" });
  }
});

// ===============================
// ME + LOGOUT (เหมือนเดิม)
// ===============================
router.get("/me", authRequired, async (req, res) => {
  const userId = req.user!.id;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, email: true, name: true, role: true, phone: true },
  });
  return res.json({ user });
});

router.post("/logout", (_req, res) => {
  return res.json({ ok: true });
});

// ===============================
// ❌ IMPORTANT: ปิด register แบบเดิม
// ===============================
// ถ้าเธอมีโค้ด router.post("/register") เดิม -> ลบทิ้ง/คอมเมนต์ทิ้งให้หมด
// เพื่อไม่ให้สมัครข้ามขั้นได้

export default router;
