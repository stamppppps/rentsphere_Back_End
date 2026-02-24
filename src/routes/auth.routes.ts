import { Router } from "express";
import bcrypt from "bcrypt";
import jwt, { type Secret, type SignOptions } from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { authRequired } from "../middlewares/auth.js";
import { randomOtp6, sha256 } from "../utils/verify.js";
import { sendVerifyEmail } from "../utils/mailer.js";
import { sendVerifySms } from "../utils/sms.js";

const router = Router();

type VerifyChannel = "EMAIL" | "PHONE";

function parseExpiresInSeconds(v?: string): number {
  // รองรับ: "7d", "24h", "30m", "120s", หรือ "604800"
  if (!v) return 7 * 24 * 60 * 60;
  const raw = v.trim();
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = raw.match(/^(\d+)\s*([smhd])$/i);
  if (!m) return 7 * 24 * 60 * 60;
  const n = Number(m[1]);
  const unit = m[2].toLowerCase();
  const mul = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
  return n * mul;
}

function signToken(payload: { id: string; role: string }) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error("JWT_SECRET is missing");
  const expiresInSeconds = parseExpiresInSeconds(process.env.JWT_EXPIRES_IN ?? "7d");
  const options: SignOptions = { expiresIn: expiresInSeconds };
  return jwt.sign(payload, secret as Secret, options);
}

function appUrl() {
  return process.env.APP_URL || "http://localhost:5173";
}

async function trySend(label: string, fn: () => Promise<void>) {
  try {
    await fn();
  } catch (err) {
    if (process.env.NODE_ENV === "production") throw err;
    console.error(`[dev] ${label} failed but continuing:`, err);
  }
}

function normalizeChannel(ch?: string): VerifyChannel {
  return (ch || "EMAIL").toUpperCase() === "PHONE" ? "PHONE" : "EMAIL";
}

function assertString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function toCleanEmail(email: unknown): string | null {
  if (!assertString(email)) return null;
  const e = email.trim().toLowerCase();
  return e.length ? e : null;
}

function toCleanPhone(phone: unknown): string | null {
  if (!assertString(phone)) return null;
  const p = phone.trim();
  return p.length ? p : null;
}


// Production Auth
// Step 1: Register (ตั้งรหัสผ่านตั้งแต่แรก)
// Step 2: Verify Email / Phone (เลือกช่องทางที่ต้องยืนยัน)
// Step 3: Login ปกติ


// STEP 1) REGISTER
router.post("/register", async (req, res) => {
  try {
    const body = (req.body ?? {}) as {
      name?: string;
      email?: string;
      phone?: string;
      password?: string;
      role?: "OWNER" | "TENANT" | "ADMIN";
      verifyChannel?: VerifyChannel;
    };

    const cleanEmail = toCleanEmail(body.email);
    const cleanPhone = toCleanPhone(body.phone);
    const password = body.password;

    if (!cleanEmail || !assertString(password)) {
      return res.status(400).json({ error: "email and password are required" });
    }
    if (!cleanPhone) {
      return res.status(400).json({ error: "phone is required" });
    }

    //ตอนนี้ให้สมัครเองได้เฉพาะ OWNER
    if ((body.role || "OWNER") !== "OWNER") {
      return res.status(403).json({ error: "Only OWNER can register" });
    }

    const existed = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (existed) return res.status(409).json({ error: "Email already exists" });

    const passwordHash = await bcrypt.hash(String(password), 10);
    const channel = normalizeChannel(body.verifyChannel);

    const user = await prisma.user.create({
      data: {
        email: cleanEmail,
        phone: cleanPhone,
        passwordHash,
        name: body.name?.trim() || null,
        role: "OWNER",
        
        verifyChannel: channel as any,
      },
      select: { id: true, email: true, phone: true, role: true, verifyChannel: true },
    });

    //สร้างverify request+ส่งโค้ด
    const code = randomOtp6();
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); 

    const vr = await prisma.verifyRequest.create({
      data: {
        userId: user.id,
        channel: channel as any,
        emailCodeHash: channel === "EMAIL" ? codeHash : null,
        phoneOtpHash: channel === "PHONE" ? codeHash : null,
        expiresAt,
      },
      select: { id: true, channel: true, expiresAt: true },
    });

    if (channel === "EMAIL"){
      await trySend("sendVerifyEmail", () =>
        sendVerifyEmail(cleanEmail, {
          code,
          verifyUrl: `${appUrl()}/auth/owner/verify-email?requestId=${vr.id}`,
        })
      );
      console.log("Email code (dev):", code, "for", cleanEmail);
    } else {
      await trySend("sendVerifySms", () => sendVerifySms(cleanPhone, code));
      console.log("SMS OTP (dev):", code, "for", cleanPhone);
    }

    return res.status(201).json({
      requestId: vr.id,
      channel: vr.channel,
      expiresAt: vr.expiresAt,
      message: "Registered. Verification code sent.",
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Register failed" });
  }
});

//VERIFY EMAIL
router.post("/verify/email", async (req, res) => {
  try {
    const { requestId, code } = (req.body ?? {}) as { requestId?: string; code?: string };
    if (!assertString(requestId) || !assertString(code)) {
      return res.status(400).json({ error: "requestId and code are required" });
    }

    const vr = await prisma.verifyRequest.findUnique({ where: { id: requestId } });
    if (!vr) return res.status(404).json({ error: "Verify request not found" });
    if (vr.channel !== "EMAIL") return res.status(400).json({ error: "This request is not EMAIL verification" });
    if (new Date() > vr.expiresAt) return res.status(400).json({ error: "Code expired" });

    const ok = sha256(code.trim()) === (vr.emailCodeHash || "");
    if (!ok) return res.status(401).json({ error: "Invalid code" });

    await prisma.user.update({
      where: { id: vr.userId },
      data: { emailVerifiedAt: new Date() }, 
    });

    await prisma.verifyRequest.delete({ where: { id: vr.id } }).catch(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Verify email failed" });
  }
});

//VERIFY PHONE
router.post("/verify/phone", async (req, res) => {
  try {
    const { requestId, otp } = (req.body ?? {}) as { requestId?: string; otp?: string };
    if (!assertString(requestId) || !assertString(otp)) {
      return res.status(400).json({ error: "requestId and otp are required" });
    }

    const vr = await prisma.verifyRequest.findUnique({ where: { id: requestId } });
    if (!vr) return res.status(404).json({ error: "Verify request not found" });
    if (vr.channel !== "PHONE") return res.status(400).json({ error: "This request is not PHONE verification" });
    if (new Date() > vr.expiresAt) return res.status(400).json({ error: "OTP expired" });

    const ok = sha256(otp.trim()) === (vr.phoneOtpHash || "");
    if (!ok) return res.status(401).json({ error: "Invalid OTP" });

    await prisma.user.update({
      where: { id: vr.userId },
      data: { phoneVerifiedAt: new Date() }, 
    });

    await prisma.verifyRequest.delete({ where: { id: vr.id } }).catch(() => {});
    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Verify phone failed" });
  }
});

// RESEND verification code
router.post("/verify/resend", async (req, res) => {
  try {
    const { requestId } = (req.body ?? {}) as { requestId?: string };
    if (!assertString(requestId)) return res.status(400).json({ error: "requestId is required" });

    const vr = await prisma.verifyRequest.findUnique({
      where: { id: requestId },
      include: { user: true },
    });
    if (!vr) return res.status(404).json({ error: "Verify request not found" });

    const code = randomOtp6();
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.verifyRequest.update({
      where: { id: vr.id },
      data: {
        expiresAt,
        emailCodeHash: vr.channel === "EMAIL" ? codeHash : null,
        phoneOtpHash: vr.channel === "PHONE" ? codeHash : null,
      },
    });

    if (vr.channel === "EMAIL") {
  const toEmail = vr.user.email;          
  if (!toEmail) return res.status(400).json({ error: "User has no email" });

  await trySend("sendVerifyEmail", () =>
    sendVerifyEmail(toEmail, {
      code,
      verifyUrl: `${appUrl()}/auth/owner/verify-email?requestId=${vr.id}`,
    })
  );

  console.log("Email code (dev):", code, "for", toEmail);
} else {
  const toPhone = vr.user.phone;          
  if (!toPhone) return res.status(400).json({ error: "User has no phone" });

  await trySend("sendVerifySms", () => sendVerifySms(toPhone, code));

  console.log("SMS OTP (dev):", code, "for", toPhone);
}

    return res.json({ ok: true, expiresAt });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Resend failed" });
  }
});

// STEP 3) LOGIN 
router.post("/login", async (req, res) => {
  try {
    const { email, password } = (req.body ?? {}) as { email?: string; password?: string };
    const cleanEmail = toCleanEmail(email);

    if (!cleanEmail || !assertString(password)) {
      return res.status(400).json({ error: "email and password are required" });
    }

    const user = await prisma.user.findUnique({ where: { email: cleanEmail } });
    if (!user || !user.passwordHash) return res.status(401).json({ error: "Invalid credentials" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: "Invalid credentials" });

    const need = (user as any).verifyChannel as VerifyChannel; 
    const verified =
      need === "EMAIL" ? !!(user as any).emailVerifiedAt : !!(user as any).phoneVerifiedAt;

    if (!verified) {
      return res.status(403).json({ error: `Please verify your ${need.toLowerCase()} first` });
    }

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

// Forgot password (Production)
router.post("/password/forgot", async (req, res) => {
  try {
    const { identifier, channel } = (req.body ?? {}) as { identifier?: string; channel?: VerifyChannel };
    if (!assertString(identifier)) return res.status(400).json({ error: "identifier is required" });

    const ch = normalizeChannel(channel);

    const user =
      ch === "EMAIL"
        ? await prisma.user.findUnique({ where: { email: identifier.trim().toLowerCase() } })
        : await prisma.user.findFirst({ where: { phone: identifier.trim() } });

    if (!user) return res.json({ ok: true });

   
    if (ch === "EMAIL" && !user.email) return res.json({ ok: true });
    if (ch === "PHONE" && !user.phone) return res.json({ ok: true });

    const code = randomOtp6();
    const codeHash = sha256(code);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await prisma.passwordResetRequest.deleteMany({ where: { userId: user.id } }).catch(() => {});

    const pr = await prisma.passwordResetRequest.create({
      data: {
        userId: user.id,
        channel: ch as any,
        codeHash,
        expiresAt,
      },
      select: { id: true, channel: true, expiresAt: true },
    });

    if (ch === "EMAIL") {
      const to = user.email as string; 
      await trySend("sendVerifyEmail", () =>
        sendVerifyEmail(to, {
          code,
          verifyUrl: `${appUrl()}/auth/owner/reset?requestId=${pr.id}&channel=EMAIL`,
        })
      );
      console.log("Reset code (dev):", code, "for", to);
    } else {
      const to = user.phone as string;
      await trySend("sendVerifySms", () => sendVerifySms(to, code));
      console.log("Reset OTP (dev):", code, "for", to);
    }

    return res.json({ ok: true, requestId: pr.id, channel: pr.channel, expiresAt: pr.expiresAt });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Forgot password failed" });
  }
});

router.post("/password/reset", async (req, res) => {
  try {
    const { requestId, code, newPassword } = (req.body ?? {}) as {
      requestId?: string;
      code?: string;
      newPassword?: string;
    };

    if (!assertString(requestId) || !assertString(code) || !assertString(newPassword)) {
      return res.status(400).json({ error: "requestId, code and newPassword are required" });
    }

    const pr = await prisma.passwordResetRequest.findUnique({ where: { id: requestId } });
    if (!pr) return res.status(404).json({ error: "Reset request not found" });
    if (pr.usedAt) return res.status(400).json({ error: "Reset request already used" });
    if (new Date() > pr.expiresAt) return res.status(400).json({ error: "Code expired" });

    const ok = sha256(code.trim()) === pr.codeHash;
    if (!ok) return res.status(401).json({ error: "Invalid code" });

    const passwordHash = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({ where: { id: pr.userId }, data: { passwordHash } });
    await prisma.passwordResetRequest.update({ where: { id: pr.id }, data: { usedAt: new Date() } });

    return res.json({ ok: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: "Reset password failed" });
  }
});


// ME + LOGOUT
router.get("/me",authRequired,async(req,res)=>{
  const userId=req.user!.id;
  const user=await prisma.user.findUnique({
    where:{id:userId},
    select:{id:true,email:true,name:true,role:true,phone:true},
  });
  return res.json({user});
});


router.post("/logout",(_req, res)=>{
  return res.json({ ok: true });
});

export default router;