import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../prisma.js";
import { authRequired } from "../middlewares/auth.js";
import { randomOtp6, sha256 } from "../utils/verify.js";
import { sendVerifyEmail } from "../utils/mailer.js";
import { sendVerifySms } from "../utils/sms.js";
const router = Router();
function parseExpiresInSeconds(v) {
    // รองรับ: "7d", "24h", "30m", "120s", หรือ "604800"
    if (!v)
        return 7 * 24 * 60 * 60;
    const raw = v.trim();
    if (/^\d+$/.test(raw))
        return Number(raw);
    const m = raw.match(/^(\d+)\s*([smhd])$/i);
    if (!m)
        return 7 * 24 * 60 * 60;
    const n = Number(m[1]);
    const unit = m[2].toLowerCase();
    const mul = unit === "s" ? 1 : unit === "m" ? 60 : unit === "h" ? 3600 : 86400;
    return n * mul;
}
function signToken(payload) {
    const secret = process.env.JWT_SECRET;
    if (!secret)
        throw new Error("JWT_SECRET is missing");
    const expiresInSeconds = parseExpiresInSeconds(process.env.JWT_EXPIRES_IN ?? "7d");
    const options = { expiresIn: expiresInSeconds };
    return jwt.sign(payload, secret, options);
}
function appUrl() {
    return process.env.APP_URL || "http://localhost:5173";
}
async function trySend(label, fn) {
    try {
        await fn();
    }
    catch (err) {
        if (process.env.NODE_ENV === "production")
            throw err;
        console.error(`[dev] ${label} failed but continuing:`, err);
    }
}
function normalizeChannel(ch) {
    return (ch || "EMAIL").toUpperCase() === "PHONE" ? "PHONE" : "EMAIL";
}
function assertString(v) {
    return typeof v === "string" && v.trim().length > 0;
}
function toCleanEmail(email) {
    if (!assertString(email))
        return null;
    const e = email.trim().toLowerCase();
    return e.length ? e : null;
}
function toCleanPhone(phone) {
    if (!assertString(phone))
        return null;
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
        const body = (req.body ?? {});
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
        if (existed)
            return res.status(409).json({ error: "Email already exists" });
        const passwordHash = await bcrypt.hash(String(password), 10);
        const channel = normalizeChannel(body.verifyChannel);
        const user = await prisma.user.create({
            data: {
                email: cleanEmail,
                phone: cleanPhone,
                passwordHash,
                name: body.name?.trim() || null,
                role: "OWNER",
                verifyChannel: channel,
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
                channel: channel,
                emailCodeHash: channel === "EMAIL" ? codeHash : null,
                phoneOtpHash: channel === "PHONE" ? codeHash : null,
                expiresAt,
            },
            select: { id: true, channel: true, expiresAt: true },
        });
        if (channel === "EMAIL") {
            await trySend("sendVerifyEmail", () => sendVerifyEmail(cleanEmail, {
                code,
                verifyUrl: `${appUrl()}/auth/owner/verify-email?requestId=${vr.id}`,
            }));
            console.log("Email code (dev):", code, "for", cleanEmail);
        }
        else {
            await trySend("sendVerifySms", () => sendVerifySms(cleanPhone, code));
            console.log("SMS OTP (dev):", code, "for", cleanPhone);
        }
        return res.status(201).json({
            requestId: vr.id,
            channel: vr.channel,
            expiresAt: vr.expiresAt,
            message: "Registered. Verification code sent.",
        });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Register failed" });
    }
});
//VERIFY EMAIL
router.post("/verify/email", async (req, res) => {
    try {
        const { requestId, code } = (req.body ?? {});
        if (!assertString(requestId) || !assertString(code)) {
            return res.status(400).json({ error: "requestId and code are required" });
        }
        const vr = await prisma.verifyRequest.findUnique({ where: { id: requestId } });
        if (!vr)
            return res.status(404).json({ error: "Verify request not found" });
        if (vr.channel !== "EMAIL")
            return res.status(400).json({ error: "This request is not EMAIL verification" });
        if (new Date() > vr.expiresAt)
            return res.status(400).json({ error: "Code expired" });
        const ok = sha256(code.trim()) === (vr.emailCodeHash || "");
        if (!ok)
            return res.status(401).json({ error: "Invalid code" });
        await prisma.user.update({
            where: { id: vr.userId },
            data: { emailVerifiedAt: new Date() },
        });
        await prisma.verifyRequest.delete({ where: { id: vr.id } }).catch(() => { });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Verify email failed" });
    }
});
//VERIFY PHONE
router.post("/verify/phone", async (req, res) => {
    try {
        const { requestId, otp } = (req.body ?? {});
        if (!assertString(requestId) || !assertString(otp)) {
            return res.status(400).json({ error: "requestId and otp are required" });
        }
        const vr = await prisma.verifyRequest.findUnique({ where: { id: requestId } });
        if (!vr)
            return res.status(404).json({ error: "Verify request not found" });
        if (vr.channel !== "PHONE")
            return res.status(400).json({ error: "This request is not PHONE verification" });
        if (new Date() > vr.expiresAt)
            return res.status(400).json({ error: "OTP expired" });
        const ok = sha256(otp.trim()) === (vr.phoneOtpHash || "");
        if (!ok)
            return res.status(401).json({ error: "Invalid OTP" });
        await prisma.user.update({
            where: { id: vr.userId },
            data: { phoneVerifiedAt: new Date() },
        });
        await prisma.verifyRequest.delete({ where: { id: vr.id } }).catch(() => { });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Verify phone failed" });
    }
});
// RESEND verification code
router.post("/verify/resend", async (req, res) => {
    try {
        const { requestId } = (req.body ?? {});
        if (!assertString(requestId))
            return res.status(400).json({ error: "requestId is required" });
        const vr = await prisma.verifyRequest.findUnique({
            where: { id: requestId },
            include: { user: true },
        });
        if (!vr)
            return res.status(404).json({ error: "Verify request not found" });
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
            if (!toEmail)
                return res.status(400).json({ error: "User has no email" });
            await trySend("sendVerifyEmail", () => sendVerifyEmail(toEmail, {
                code,
                verifyUrl: `${appUrl()}/auth/owner/verify-email?requestId=${vr.id}`,
            }));
            console.log("Email code (dev):", code, "for", toEmail);
        }
        else {
            const toPhone = vr.user.phone;
            if (!toPhone)
                return res.status(400).json({ error: "User has no phone" });
            await trySend("sendVerifySms", () => sendVerifySms(toPhone, code));
            console.log("SMS OTP (dev):", code, "for", toPhone);
        }
        return res.json({ ok: true, expiresAt });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Resend failed" });
    }
});
// STEP 3) LOGIN 
router.post("/login", async (req, res) => {
    try {
        const { email, phone, identifier, password } = (req.body ?? {});
        const loginIdRaw = email ?? phone ?? identifier;
        if (!assertString(loginIdRaw) || !assertString(password)) {
            return res.status(400).json({ error: "email/phone and password are required" });
        }
        const loginId = String(loginIdRaw).trim();
        const isEmail = loginId.includes("@");
        const cleanEmail = isEmail ? toCleanEmail(loginId) : null;
        if (isEmail && !cleanEmail) {
            return res.status(400).json({ error: "invalid email" });
        }
        const user = await prisma.user.findUnique({
            where: isEmail ? { email: cleanEmail } : { phone: loginId },
        });
        if (!user || !user.passwordHash)
            return res.status(401).json({ error: "Invalid credentials" });
        if (user.isActive === false) {
            return res.status(403).json({ error: "Account is inactive" });
        }
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ error: "Invalid credentials" });
        const need = user.verifyChannel;
        const verified = need === "EMAIL" ? !!user.emailVerifiedAt : !!user.phoneVerifiedAt;
        if (!verified) {
            return res.status(403).json({ error: `Please verify your ${need.toLowerCase()} first` });
        }
        let staffMemberships = undefined;
        if (user.role === "STAFF") {
            const memberships = await prisma.staffMembership.findMany({
                where: { staffUserId: user.id, isActive: true },
                select: {
                    id: true,
                    condoId: true,
                    staffPosition: true,
                    condo: { select: { id: true, nameTh: true, nameEn: true } },
                },
                orderBy: { createdAt: "desc" },
            });
            if (memberships.length === 0) {
                return res.status(403).json({ error: "STAFF has no active membership" });
            }
            staffMemberships = memberships.map((m) => ({
                id: m.id,
                condoId: m.condoId,
                condoName: m.condo?.nameTh ?? m.condo?.nameEn ?? "—",
                staffPosition: m.staffPosition,
            }));
        }
        const token = signToken({ id: user.id, role: user.role });
        return res.json({
            user: { id: user.id, email: user.email, phone: user.phone, name: user.name, role: user.role },
            token,
            ...(staffMemberships ? { staffMemberships } : {}),
        });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Login failed" });
    }
});
// Forgot password (Production)
router.post("/password/forgot", async (req, res) => {
    try {
        const { identifier, channel } = (req.body ?? {});
        if (!assertString(identifier))
            return res.status(400).json({ error: "identifier is required" });
        const ch = normalizeChannel(channel);
        const user = ch === "EMAIL"
            ? await prisma.user.findUnique({ where: { email: identifier.trim().toLowerCase() } })
            : await prisma.user.findFirst({ where: { phone: identifier.trim() } });
        if (!user)
            return res.json({ ok: true });
        if (ch === "EMAIL" && !user.email)
            return res.json({ ok: true });
        if (ch === "PHONE" && !user.phone)
            return res.json({ ok: true });
        const code = randomOtp6();
        const codeHash = sha256(code);
        const expiresAt = new Date(Date.now() + 10 * 60 * 1000);
        await prisma.passwordResetRequest.deleteMany({ where: { userId: user.id } }).catch(() => { });
        const pr = await prisma.passwordResetRequest.create({
            data: {
                userId: user.id,
                channel: ch,
                codeHash,
                expiresAt,
            },
            select: { id: true, channel: true, expiresAt: true },
        });
        if (ch === "EMAIL") {
            const to = user.email;
            await trySend("sendVerifyEmail", () => sendVerifyEmail(to, {
                code,
                verifyUrl: `${appUrl()}/auth/owner/reset?requestId=${pr.id}&channel=EMAIL`,
            }));
            console.log("Reset code (dev):", code, "for", to);
        }
        else {
            const to = user.phone;
            await trySend("sendVerifySms", () => sendVerifySms(to, code));
            console.log("Reset OTP (dev):", code, "for", to);
        }
        return res.json({ ok: true, requestId: pr.id, channel: pr.channel, expiresAt: pr.expiresAt });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Forgot password failed" });
    }
});
router.post("/password/reset", async (req, res) => {
    try {
        const { requestId, code, newPassword } = (req.body ?? {});
        if (!assertString(requestId) || !assertString(code) || !assertString(newPassword)) {
            return res.status(400).json({ error: "requestId, code and newPassword are required" });
        }
        const pr = await prisma.passwordResetRequest.findUnique({ where: { id: requestId } });
        if (!pr)
            return res.status(404).json({ error: "Reset request not found" });
        if (pr.usedAt)
            return res.status(400).json({ error: "Reset request already used" });
        if (new Date() > pr.expiresAt)
            return res.status(400).json({ error: "Code expired" });
        const ok = sha256(code.trim()) === pr.codeHash;
        if (!ok)
            return res.status(401).json({ error: "Invalid code" });
        const passwordHash = await bcrypt.hash(newPassword, 10);
        await prisma.user.update({ where: { id: pr.userId }, data: { passwordHash } });
        await prisma.passwordResetRequest.update({ where: { id: pr.id }, data: { usedAt: new Date() } });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error(e);
        return res.status(500).json({ error: "Reset password failed" });
    }
});
// ME + LOGOUT
router.get("/me", authRequired, async (req, res) => {
    const userId = req.user.id;
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, email: true, name: true, role: true, phone: true },
    });
    if (!user)
        return res.status(404).json({ error: "User not found" });
    // STAFF: ส่ง memberships + สิทธิ์ 
    if (user.role === "STAFF") {
        const memberships = await prisma.staffMembership.findMany({
            where: { staffUserId: userId, isActive: true },
            select: {
                id: true,
                condoId: true,
                staffPosition: true,
                isActive: true,
                condo: { select: { id: true, nameTh: true, nameEn: true } },
                permissionOverrides: {
                    select: {
                        allowed: true,
                        permission: { select: { module: true, code: true } },
                    },
                },
            },
            orderBy: { createdAt: "desc" },
        });
        return res.json({
            user,
            staffMemberships: memberships.map((m) => ({
                id: m.id,
                condoId: m.condoId,
                condoName: m.condo?.nameTh ?? m.condo?.nameEn ?? "—",
                staffPosition: m.staffPosition,
                isActive: m.isActive,
                allowedModules: (m.permissionOverrides ?? [])
                    .filter((x) => x.allowed)
                    .map((x) => x.permission.module),
            })),
        });
    }
    return res.json({ user });
});
router.post("/logout", (_req, res) => {
    return res.json({ ok: true });
});
/* =========================================================
   LINE OAuth Login
   GET /auth/line/login → redirect ไป LINE OAuth
   GET /auth/line/callback → รับ code จาก LINE, แลก token, redirect กลับ frontend
   ========================================================= */
router.get("/line/login", (_req, res) => {
    const channelId = process.env.LINE_LOGIN_CLIENT_ID;
    if (!channelId) {
        return res.status(500).json({ error: "LINE_LOGIN_CLIENT_ID not configured" });
    }
    const baseUrl = (process.env.API_URL || "http://localhost:3000").replace(/\/+$/, "");
    const callbackUrl = `${baseUrl}/auth/line/callback`;
    const state = Math.random().toString(36).substring(2, 15);
    const lineAuthUrl = `https://access.line.me/oauth2/v2.1/authorize` +
        `?response_type=code` +
        `&client_id=${channelId}` +
        `&redirect_uri=${encodeURIComponent(callbackUrl)}` +
        `&state=${state}` +
        `&scope=profile%20openid`;
    return res.redirect(lineAuthUrl);
});
router.get("/line/callback", async (req, res) => {
    try {
        const { code } = req.query;
        if (!code) {
            return res.status(400).send("Missing authorization code from LINE");
        }
        const channelId = process.env.LINE_LOGIN_CLIENT_ID;
        const channelSecret = process.env.LINE_LOGIN_CLIENT_SECRET;
        if (!channelId || !channelSecret) {
            return res.status(500).send("LINE_LOGIN_CLIENT_ID or LINE_LOGIN_CLIENT_SECRET not configured");
        }
        const baseUrl = (process.env.API_URL || "http://localhost:3000").replace(/\/+$/, "");
        const callbackUrl = `${baseUrl}/auth/line/callback`;
        // 1) Exchange code for access token
        const tokenRes = await fetch("https://api.line.me/oauth2/v2.1/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: callbackUrl,
                client_id: channelId,
                client_secret: channelSecret,
            }),
        });
        const tokenData = (await tokenRes.json());
        if (!tokenRes.ok || !tokenData.access_token) {
            console.error("LINE token exchange failed:", JSON.stringify(tokenData, null, 2));
            console.error("callbackUrl used:", callbackUrl);
            console.error("channelId:", channelId);
            return res.status(400).send("LINE token exchange failed: " + (tokenData?.error_description || tokenData?.error || "unknown"));
        }
        // 2) Get user profile
        const profileRes = await fetch("https://api.line.me/v2/profile", {
            headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profile = (await profileRes.json());
        const lineUserId = profile.userId;
        if (!lineUserId) {
            return res.status(400).send("Could not get LINE userId");
        }
        // 3) Upsert LineAccount in DB
        const existing = await prisma.lineAccount.findUnique({
            where: { lineUserId },
            select: { id: true, userId: true },
        });
        if (!existing) {
            // Create a new TENANT user + LineAccount
            const newUser = await prisma.user.create({
                data: {
                    role: "TENANT",
                    name: profile.displayName || "LINE User",
                    isActive: true,
                    verifyChannel: "PHONE",
                },
                select: { id: true },
            });
            await prisma.lineAccount.create({
                data: {
                    userId: newUser.id,
                    lineUserId,
                    displayName: profile.displayName || null,
                    pictureUrl: profile.pictureUrl || null,
                    isActive: true,
                },
            });
        }
        else {
            // Update display name/picture
            await prisma.lineAccount.update({
                where: { lineUserId },
                data: {
                    displayName: profile.displayName || undefined,
                    pictureUrl: profile.pictureUrl || undefined,
                    isActive: true,
                    linkedAt: new Date(),
                },
            });
        }
        // 4) Redirect to frontend with lineUserId
        const frontendUrl = (process.env.APP_URL || "http://localhost:5173").replace(/\/+$/, "");
        return res.redirect(`${frontendUrl}/owner/line-login-success?lineUserId=${encodeURIComponent(lineUserId)}`);
    }
    catch (err) {
        console.error("LINE callback error:", err);
        return res.status(500).send("LINE login failed: " + (err?.message || "unknown"));
    }
});
export default router;
