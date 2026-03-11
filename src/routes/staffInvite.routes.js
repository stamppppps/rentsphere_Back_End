import { Router } from "express";
import { prisma } from "../prisma.js";
import bcrypt from "bcrypt";
const router = Router();
function assertInviteUsable(invite) {
    if (invite.status !== "PENDING") {
        const err = new Error("Invite already used");
        err.status = 400;
        throw err;
    }
    if (invite.expiresAt.getTime() < Date.now()) {
        const err = new Error("Invite expired");
        err.status = 400;
        throw err;
    }
}
// FE: GET /api/v1/staff-invites/:token
router.get("/:token", async (req, res) => {
    try {
        const token = String(req.params.token);
        const invite = await prisma.staffInvite.findUnique({
            where: { token },
            select: {
                token: true,
                expiresAt: true,
                status: true,
                email: true,
                phone: true,
                staffPosition: true,
                condo: { select: { id: true, nameTh: true } },
                staffUserId: true, // ใช้ accept
            },
        });
        if (!invite)
            return res.status(404).json({ error: "Invite not found" });
        try {
            assertInviteUsable(invite);
        }
        catch (e) {
            return res.status(e?.status ?? 400).json({ error: e?.message ?? "Invalid invite" });
        }
        return res.json({ invite });
    }
    catch (err) {
        console.error("GET STAFF INVITE ERROR:", err);
        return res.status(500).json({ error: "Failed to fetch invite" });
    }
});
// FE: POST /api/v1/staff-invites/:token/accept
router.post("/:token/accept", async (req, res) => {
    try {
        const token = String(req.params.token);
        const password = String(req.body?.password ?? "");
        if (password.length < 8)
            return res.status(400).json({ error: "Password too short" });
        const invite = await prisma.staffInvite.findUnique({
            where: { token },
            select: { id: true, status: true, expiresAt: true, staffUserId: true },
        });
        if (!invite)
            return res.status(404).json({ error: "Invite not found" });
        try {
            assertInviteUsable(invite);
        }
        catch (e) {
            return res.status(e?.status ?? 400).json({ error: e?.message ?? "Invalid invite" });
        }
        const staffUserId = invite.staffUserId;
        if (!staffUserId)
            return res.status(400).json({ error: "Invite has no staffUserId" });
        const passwordHash = await bcrypt.hash(password, 10);
        await prisma.$transaction(async (tx) => {
            await tx.user.update({
                where: { id: staffUserId }, // ✅ ใช้ตัวแปร
                data: { passwordHash, isActive: true, emailVerifiedAt: new Date() },
            });
            await tx.staffInvite.update({
                where: { id: invite.id },
                data: { status: "ACCEPTED" },
            });
        });
        return res.json({ ok: true });
    }
    catch (err) {
        console.error("ACCEPT STAFF INVITE ERROR:", err);
        return res.status(500).json({ error: "Failed to accept invite" });
    }
});
export default router;
