import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

// GET /users  -> list users
router.get("/", async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.json(users);
});

// POST /users -> create user (test)
router.post("/", async (req, res) => {
  const { email, name, phone, role } = req.body;

  if (!email || typeof email !== "string") {
    return res.status(400).json({ error: "email is required" });
  }
  if (role && typeof role !== "string") {
    return res.status(400).json({ error: "role must be string" });
  }

  const created = await prisma.user.create({
    data: {
      email,
      name: typeof name === "string" ? name : null,
      phone: typeof phone === "string" ? phone : null,
      role: role ?? "TENANT", // default เทส
    } as any,
    select: {
      id: true,
      email: true,
      name: true,
      phone: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  res.status(201).json(created);
});

// PATCH /users/:id -> update name/phone
router.patch("/:id", async (req, res) => {
  const id = req.params.id; // ✅ id เป็น String (cuid)
  const { name, phone } = req.body;

  try {
    const updated = await prisma.user.update({
      where: { id },
      data: {
        name: typeof name === "string" ? name : undefined,
        phone: typeof phone === "string" ? phone : undefined,
      },
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    res.json(updated);
  } catch (err: any) {
    // Prisma: record not found
    if (err?.code === "P2025") return res.status(404).json({ error: "User not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to update user" });
  }
});

// DELETE /users/:id
router.delete("/:id", async (req, res) => {
  const id = req.params.id;

  try {
    await prisma.user.delete({ where: { id } });
    res.json({ ok: true });
  } catch (err: any) {
    if (err?.code === "P2025") return res.status(404).json({ error: "User not found" });
    console.error(err);
    res.status(500).json({ error: "Failed to delete user" });
  }
});

export default router;
