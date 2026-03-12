import { Prisma } from "@prisma/client";
import { Router } from "express";
import { authRequired } from "../middlewares/auth.js";
import { requireRole } from "../middlewares/requireRole.js";
import { uploadMemory } from "../middlewares/uploadMemory.js";
import { prisma } from "../prisma.js";
import { cloudinary } from "../utils/cloudinary.js";

const router = Router();

router.use(authRequired, requireRole(["OWNER"]));
type ReqUser = {
    id?: string;
};

function getUserId(req: any) {
    return (req.user as ReqUser | undefined)?.id ?? null;
}

function asTrimmedString(v: any): string | null {
    if (typeof v !== "string") return null;
    const s = v.trim();
    return s.length ? s : null;
}

function asOptionalInt(v: any): number | null {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.trunc(n);
}

function asOptionalMoney(v: any): number | null {
    if (v === undefined || v === null || String(v).trim() === "") return null;
    const n = Number(String(v).replace(/,/g, "").trim());
    if (!Number.isFinite(n)) return null;
    return n;
}

function timeToHHMM(d: Date | null | undefined) {
    if (!d) return null;
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${hh}:${mm}`;
}

function dateToYYYYMMDD(d: Date | null | undefined) {
    if (!d) return null;

    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(d.getUTCDate()).padStart(2, "0");

    return `${yyyy}-${mm}-${dd}`;
}

function parseTimeToDate(value: any): Date | null {
    if (typeof value !== "string") return null;
    const raw = value.trim();
    const m = raw.match(/^(\d{2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;

    const hh = Number(m[1]);
    const mm = Number(m[2]);
    const ss = Number(m[3] ?? "0");

    if (hh < 0 || hh > 23 || mm < 0 || mm > 59 || ss < 0 || ss > 59) return null;

    return new Date(1970, 0, 1, hh, mm, ss, 0);
}

function parseDateOnly(value: any): Date | null {
    if (typeof value !== "string") return null;

    const [y, m, d] = value.split("-").map(Number);

    return new Date(Date.UTC(y, m - 1, d));
}

function mapFacilityStatus(isActive: boolean) {
    return isActive ? "AVAILABLE" : "MAINTENANCE";
}

function mapFacilityRow(row: any) {
    return {
        id: row.id,
        condoId: row.condoId,
        name: row.facilityName,
        facilityName: row.facilityName,
        description: row.description ?? "",
        coverImageUrl: row.coverImageUrl ?? null,
        isActive: row.isActive,
        status: mapFacilityStatus(row.isActive),
        createdAt: dateToYYYYMMDD(row.createdAt),
        updatedAt: row.updatedAt ?? null,
        bookingSetting: row.bookingSetting
            ? {
                id: row.bookingSetting.id,
                openTime: timeToHHMM(row.bookingSetting.openTime),
                closeTime: timeToHHMM(row.bookingSetting.closeTime),
                slotMinutes: row.bookingSetting.slotMinutes,
                maxPeople: row.bookingSetting.maxPeople,
                maxBookingsPerDay: row.bookingSetting.maxBookingsPerDay,
                requiresApproval: row.bookingSetting.requiresApproval,
                feePerSlot: Number(row.bookingSetting.feePerSlot ?? 0),
                deposit: Number(row.bookingSetting.deposit ?? 0),
                cancellationHours: row.bookingSetting.cancellationHours,
            }
            : null,
    };
}

function mapBookingRow(row: any) {
    return {
        id: row.id,
        condoId: row.condoId,
        facilityId: row.facilityId,
        roomId: row.roomId ?? null,
        tenantUserId: row.tenantUserId ?? null,
        userName: row.tenant?.name ?? row.creator?.name ?? "-",
        unit: row.room?.roomNo ?? "-",
        facilityName: row.facility?.facilityName ?? "-",
        date: dateToYYYYMMDD(row.bookingDate),
        startTime: timeToHHMM(row.startTime),
        endTime: timeToHHMM(row.endTime),
        peopleCount: row.peopleCount ?? null,
        note: row.note ?? "",
        status: row.status,
        approvedBy: row.approvedBy ?? null,
        approvedAt: row.approvedAt ?? null,
        rejectionReason: row.rejectReason ?? null,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt ?? null,
    };
}

async function assertOwnerCondoOrThrow(ownerId: string, condoId: string) {
    const condo = await prisma.condo.findFirst({
        where: { id: condoId, ownerUserId: ownerId },
        select: { id: true, nameTh: true },
    });

    if (!condo) {
        const err: any = new Error("Forbidden (not your condo)");
        err.status = 403;
        throw err;
    }

    return condo;
}

async function assertOwnerFacilityOrThrow(ownerId: string, facilityId: string) {
    const facility = await prisma.facility.findFirst({
        where: {
            id: facilityId,
            condo: { ownerUserId: ownerId },
        },
        select: {
            id: true,
            condoId: true,
            facilityName: true,
            isActive: true,
        },
    });

    if (!facility) {
        const err: any = new Error("Forbidden (not your facility)");
        err.status = 403;
        throw err;
    }

    return facility;
}

async function assertOwnerBookingOrThrow(ownerId: string, bookingId: string) {
    const booking = await prisma.facilityBooking.findFirst({
        where: {
            id: bookingId,
            condo: { ownerUserId: ownerId },
        },
        select: {
            id: true,
            condoId: true,
            facilityId: true,
            status: true,
        },
    });

    if (!booking) {
        const err: any = new Error("Forbidden (not your booking)");
        err.status = 403;
        throw err;
    }

    return booking;
}

/* =========================
   Facilities
   ========================= */

// GET /owner/condos/:condoId/facilities
router.get("/condos/:condoId/facilities", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const condoId = String(req.params.condoId);
        await assertOwnerCondoOrThrow(ownerId, condoId);

        const rows = await prisma.facility.findMany({
            where: { condoId },
            include: {
                bookingSetting: true,
            },
            orderBy: { createdAt: "asc" },
        });

        return res.json(rows.map(mapFacilityRow));
    } catch (err: any) {
        console.error("LIST FACILITIES ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch facilities",
        });
    }
});

router.get("/condos/:condoId/booking-policy", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const condoId = String(req.params.condoId);
        await assertOwnerCondoOrThrow(ownerId, condoId);

        const firstFacility = await prisma.facility.findFirst({
            where: { condoId },
            include: { bookingSetting: true },
        });

        return res.json({
            condoId,
            maxBookingsPerDay:
                firstFacility?.bookingSetting?.maxBookingsPerDay ?? 2,
        });
    } catch (err: any) {
        console.error("GET POLICY ERROR:", err);
        res.status(500).json({ error: "Failed to fetch booking policy" });
    }
});

router.put("/condos/:condoId/booking-policy", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const condoId = String(req.params.condoId);
        await assertOwnerCondoOrThrow(ownerId, condoId);

        const maxBookingsPerDay = asOptionalInt(req.body?.maxBookingsPerDay);

        if (!maxBookingsPerDay || maxBookingsPerDay <= 0) {
            return res.status(400).json({
                error: "maxBookingsPerDay must be > 0",
            });
        }

        const facilities = await prisma.facility.findMany({
            where: { condoId },
            select: { id: true },
        });

        await prisma.$transaction(
            facilities.map((f) =>
                prisma.facilityBookingSetting.upsert({
                    where: { facilityId: f.id },
                    create: {
                        facilityId: f.id,
                        openTime: new Date(1970, 0, 1, 8, 0),
                        closeTime: new Date(1970, 0, 1, 20, 0),
                        slotMinutes: 60,
                        maxPeople: 1,
                        maxBookingsPerDay,
                        requiresApproval: false,
                        feePerSlot: new Prisma.Decimal("0"),
                        deposit: new Prisma.Decimal("0"),
                        cancellationHours: 0,
                    },
                    update: {
                        maxBookingsPerDay,
                    },
                })
            )
        );

        res.json({
            ok: true,
            condoId,
            maxBookingsPerDay,
        });
    } catch (err: any) {
        console.error("SAVE POLICY ERROR:", err);
        res.status(500).json({ error: "Failed to save booking policy" });
    }
});

// POST /owner/condos/:condoId/facilities
router.post("/condos/:condoId/facilities", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const condoId = String(req.params.condoId);
        await assertOwnerCondoOrThrow(ownerId, condoId);

        const facilityName = asTrimmedString(req.body?.facilityName ?? req.body?.name);
        const description = asTrimmedString(req.body?.description);
        const coverImageUrl = asTrimmedString(req.body?.coverImageUrl);

        if (!facilityName) {
            return res.status(400).json({ error: "facilityName is required" });
        }

        const created = await prisma.facility.create({
            data: {
                condoId,
                facilityName,
                description,
                coverImageUrl,
                isActive: true,
            },
            include: {
                bookingSetting: true,
            },
        });

        return res.status(201).json(mapFacilityRow(created));
    } catch (err: any) {
        console.error("CREATE FACILITY ERROR:", err);
        return res.status(500).json({
            error: err?.message ?? "Failed to create facility",
        });
    }
});

// GET /owner/facilities/:facilityId
router.get("/facilities/:facilityId", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        const row = await prisma.facility.findUnique({
            where: { id: facilityId },
            include: {
                bookingSetting: true,
            },
        });

        if (!row) {
            return res.status(404).json({ error: "Facility not found" });
        }

        return res.json(mapFacilityRow(row));
    } catch (err: any) {
        console.error("GET FACILITY DETAIL ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch facility detail",
        });
    }
});

// PATCH /owner/facilities/:facilityId
router.patch("/facilities/:facilityId", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        const data: any = {};

        if ("facilityName" in req.body || "name" in req.body) {
            const facilityName = asTrimmedString(req.body?.facilityName ?? req.body?.name);
            if (!facilityName) {
                return res.status(400).json({ error: "facilityName is required" });
            }
            data.facilityName = facilityName;
        }

        if ("description" in req.body) {
            data.description = asTrimmedString(req.body?.description);
        }

        if ("coverImageUrl" in req.body) {
            data.coverImageUrl = asTrimmedString(req.body?.coverImageUrl);
        }

        if ("status" in req.body) {
            const status = String(req.body?.status ?? "").toUpperCase();
            if (status !== "AVAILABLE" && status !== "MAINTENANCE") {
                return res.status(400).json({ error: "status must be AVAILABLE or MAINTENANCE" });
            }
            data.isActive = status === "AVAILABLE";
        }

        if ("isActive" in req.body) {
            data.isActive = Boolean(req.body?.isActive);
        }

        const updated = await prisma.facility.update({
            where: { id: facilityId },
            data,
            include: {
                bookingSetting: true,
            },
        });

        return res.json(mapFacilityRow(updated));
    } catch (err: any) {
        console.error("UPDATE FACILITY ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to update facility",
        });
    }
});

// POST /owner/facilities/:facilityId/image
router.post("/facilities/:facilityId/image", uploadMemory.single("image"), async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        if (!req.file) {
            return res.status(400).json({ error: "Missing file field 'image'" });
        }

        const file = req.file;

        const uploadResult = await new Promise<{ secure_url?: string }>((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
                {
                    folder: `rentsphere/facilities/${facilityId}`,
                    resource_type: "image",
                    overwrite: true,
                    public_id: "cover",
                },
                (err, result) => {
                    if (err) return reject(err);
                    resolve(result as any);
                }
            );

            stream.end(file.buffer);
        });

        const coverImageUrl = String(uploadResult?.secure_url ?? "");
        if (!coverImageUrl) {
            return res.status(500).json({ error: "Cloudinary upload failed" });
        }

        const updated = await prisma.facility.update({
            where: { id: facilityId },
            data: { coverImageUrl },
            include: {
                bookingSetting: true,
            },
        });

        return res.json(mapFacilityRow(updated));
    } catch (err: any) {
        console.error("UPLOAD FACILITY IMAGE ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to upload facility image",
        });
    }
});

// PATCH /owner/facilities/:facilityId/status
router.patch("/facilities/:facilityId/status", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        const status = String(req.body?.status ?? "").toUpperCase();
        if (status !== "AVAILABLE" && status !== "MAINTENANCE") {
            return res.status(400).json({ error: "status must be AVAILABLE or MAINTENANCE" });
        }

        const updated = await prisma.facility.update({
            where: { id: facilityId },
            data: {
                isActive: status === "AVAILABLE",
            },
            include: {
                bookingSetting: true,
            },
        });

        return res.json(mapFacilityRow(updated));
    } catch (err: any) {
        console.error("UPDATE FACILITY STATUS ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to update facility status",
        });
    }
});

// PUT /owner/facilities/:facilityId/settings
router.put("/facilities/:facilityId/settings", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        const openTime = parseTimeToDate(req.body?.openTime);
        const closeTime = parseTimeToDate(req.body?.closeTime);
        const slotMinutes = asOptionalInt(req.body?.slotMinutes) ?? 60;
        const maxPeople = asOptionalInt(req.body?.maxPeople);
        const maxBookingsPerDay = asOptionalInt(req.body?.maxBookingsPerDay);
        const requiresApproval = Boolean(req.body?.requiresApproval ?? false);
        const feePerSlot = asOptionalMoney(req.body?.feePerSlot) ?? 0;
        const deposit = asOptionalMoney(req.body?.deposit) ?? 0;
        const cancellationHours = asOptionalInt(req.body?.cancellationHours) ?? 0;

        if (!openTime) {
            return res.status(400).json({ error: "openTime is required (HH:mm)" });
        }
        if (!closeTime) {
            return res.status(400).json({ error: "closeTime is required (HH:mm)" });
        }
        if (slotMinutes <= 0) {
            return res.status(400).json({ error: "slotMinutes must be > 0" });
        }
        if (maxPeople !== null && maxPeople <= 0) {
            return res.status(400).json({ error: "maxPeople must be > 0" });
        }
        if (maxBookingsPerDay !== null && maxBookingsPerDay <= 0) {
            return res.status(400).json({ error: "maxBookingsPerDay must be > 0" });
        }
        if (feePerSlot < 0 || (deposit < 0 || cancellationHours < 0)) {
            return res.status(400).json({
                error: "feePerSlot / deposit / cancellationHours must be >= 0",
            });
        }

        const saved = await prisma.facilityBookingSetting.upsert({
            where: { facilityId },
            create: {
                facilityId,
                openTime,
                closeTime,
                slotMinutes,
                maxPeople,
                maxBookingsPerDay,
                requiresApproval,
                feePerSlot: new Prisma.Decimal(String(feePerSlot)),
                deposit: new Prisma.Decimal(String(deposit)),
                cancellationHours,
            },
            update: {
                openTime,
                closeTime,
                slotMinutes,
                maxPeople,
                maxBookingsPerDay,
                requiresApproval,
                feePerSlot: new Prisma.Decimal(String(feePerSlot)),
                deposit: new Prisma.Decimal(String(deposit)),
                cancellationHours,
            },
        });

        return res.json({
            id: saved.id,
            facilityId: saved.facilityId,
            openTime: timeToHHMM(saved.openTime),
            closeTime: timeToHHMM(saved.closeTime),
            slotMinutes: saved.slotMinutes,
            maxPeople: saved.maxPeople,
            maxBookingsPerDay: saved.maxBookingsPerDay,
            requiresApproval: saved.requiresApproval,
            feePerSlot: Number(saved.feePerSlot ?? 0),
            deposit: Number(saved.deposit ?? 0),
            cancellationHours: saved.cancellationHours,
        });
    } catch (err: any) {
        console.error("SAVE FACILITY SETTINGS ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to save facility settings",
        });
    }
});

/* =========================
   Bookings
   ========================= */

// GET /owner/bookings
router.get("/bookings", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const rows = await prisma.facilityBooking.findMany({
            where: {
                condo: { ownerUserId: ownerId },
            },
            include: {
                tenant: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                room: { select: { id: true, roomNo: true } },
                facility: { select: { id: true, facilityName: true } },
            },
            orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
        });

        return res.json(rows.map(mapBookingRow));
    } catch (err: any) {
        console.error("LIST BOOKINGS ERROR:", err);
        return res.status(500).json({
            error: err?.message ?? "Failed to fetch bookings",
        });
    }
});

// GET /owner/facilities/:facilityId/bookings
router.get("/facilities/:facilityId/bookings", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        const rows = await prisma.facilityBooking.findMany({
            where: { facilityId },
            include: {
                tenant: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                room: { select: { id: true, roomNo: true } },
                facility: { select: { id: true, facilityName: true } },
            },
            orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
        });

        return res.json(rows.map(mapBookingRow));
    } catch (err: any) {
        console.error("LIST FACILITY BOOKINGS ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch facility bookings",
        });
    }
});

// DELETE /owner/facilities/:facilityId
router.delete("/facilities/:facilityId", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        await assertOwnerFacilityOrThrow(ownerId, facilityId);

        await prisma.$transaction(async (tx) => {
            await tx.facilityBookingUpdate.deleteMany({
                where: {
                    booking: {
                        facilityId,
                    },
                },
            });

            await tx.facilityBooking.deleteMany({
                where: { facilityId },
            });

            await tx.facilityBookingSetting.deleteMany({
                where: { facilityId },
            });

            await tx.facility.delete({
                where: { id: facilityId },
            });
        });

        return res.json({ ok: true });
    } catch (err: any) {
        console.error("DELETE FACILITY ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to delete facility",
        });
    }
});

// GET /owner/bookings/:bookingId
router.get("/bookings/:bookingId", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const bookingId = String(req.params.bookingId);
        await assertOwnerBookingOrThrow(ownerId, bookingId);

        const row = await prisma.facilityBooking.findUnique({
            where: { id: bookingId },
            include: {
                tenant: { select: { id: true, name: true } },
                creator: { select: { id: true, name: true } },
                room: { select: { id: true, roomNo: true } },
                facility: {
                    select: {
                        id: true,
                        facilityName: true,
                        bookingSetting: true,
                    },
                },
                approver: { select: { id: true, name: true } },
                updates: {
                    orderBy: { createdAt: "asc" },
                    select: {
                        id: true,
                        updateType: true,
                        oldStatus: true,
                        newStatus: true,
                        message: true,
                        createdAt: true,
                        creator: { select: { id: true, name: true } },
                    },
                },
            },
        });

        if (!row) {
            return res.status(404).json({ error: "Booking not found" });
        }

        return res.json({
            ...mapBookingRow(row),
            approverName: row.approver?.name ?? null,
            updates: row.updates.map((u) => ({
                id: u.id,
                updateType: u.updateType,
                oldStatus: u.oldStatus,
                newStatus: u.newStatus,
                message: u.message ?? "",
                createdAt: u.createdAt,
                createdBy: u.creator?.id ?? null,
                createdByName: u.creator?.name ?? "-",
            })),
            facilitySetting: row.facility?.bookingSetting
                ? {
                    openTime: timeToHHMM(row.facility.bookingSetting.openTime),
                    closeTime: timeToHHMM(row.facility.bookingSetting.closeTime),
                    slotMinutes: row.facility.bookingSetting.slotMinutes,
                    maxPeople: row.facility.bookingSetting.maxPeople,
                    maxBookingsPerDay: row.facility.bookingSetting.maxBookingsPerDay,
                    requiresApproval: row.facility.bookingSetting.requiresApproval,
                    feePerSlot: Number(row.facility.bookingSetting.feePerSlot ?? 0),
                    deposit: Number(row.facility.bookingSetting.deposit ?? 0),
                    cancellationHours: row.facility.bookingSetting.cancellationHours,
                }
                : null,
        });
    } catch (err: any) {
        console.error("GET BOOKING DETAIL ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch booking detail",
        });
    }
});

// PATCH /owner/bookings/:bookingId/status
router.patch("/bookings/:bookingId/status", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const bookingId = String(req.params.bookingId);
        const current = await assertOwnerBookingOrThrow(ownerId, bookingId);

        const nextStatus = String(req.body?.status ?? "").toUpperCase();
        const rejectReason = asTrimmedString(req.body?.reason ?? req.body?.rejectReason);
        const message = asTrimmedString(req.body?.message ?? req.body?.notes);

        const allowedStatuses = [
            "PENDING",
            "APPROVED",
            "REJECTED",
            "CANCELLED",
            "COMPLETED",
        ];

        if (!allowedStatuses.includes(nextStatus)) {
            return res.status(400).json({
                error: "status must be PENDING | APPROVED | REJECTED | CANCELLED | COMPLETED",
            });
        }

        if (nextStatus === "REJECTED" && !rejectReason) {
            return res.status(400).json({
                error: "reason is required when status = REJECTED",
            });
        }

        const updated = await prisma.$transaction(async (tx) => {
            const booking = await tx.facilityBooking.update({
                where: { id: bookingId },
                data: {
                    status: nextStatus as any,
                    approvedBy: nextStatus === "APPROVED" ? ownerId : null,
                    approvedAt: nextStatus === "APPROVED" ? new Date() : null,
                    rejectReason: nextStatus === "REJECTED" ? rejectReason : null,
                },
                include: {
                    tenant: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    room: { select: { id: true, roomNo: true } },
                    facility: { select: { id: true, facilityName: true } },
                },
            });

            await tx.facilityBookingUpdate.create({
                data: {
                    bookingId,
                    updateType:
                        nextStatus === "APPROVED"
                            ? "APPROVAL"
                            : nextStatus === "REJECTED"
                                ? "APPROVAL"
                                : "STATUS_CHANGE",
                    oldStatus: current.status as any,
                    newStatus: nextStatus as any,
                    message:
                        message ??
                        (nextStatus === "REJECTED" ? rejectReason : null) ??
                        `Booking status updated to ${nextStatus}`,
                    createdBy: ownerId,
                },
            });

            return booking;
        });

        return res.json(mapBookingRow(updated));
    } catch (err: any) {
        console.error("UPDATE BOOKING STATUS ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to update booking status",
        });
    }
});

// PATCH /owner/bookings/:bookingId
router.patch("/bookings/:bookingId", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const bookingId = String(req.params.bookingId);
        const current = await assertOwnerBookingOrThrow(ownerId, bookingId);

        const bookingDate =
            "date" in req.body || "bookingDate" in req.body
                ? parseDateOnly(req.body?.date ?? req.body?.bookingDate)
                : undefined;

        const startTime =
            "startTime" in req.body ? parseTimeToDate(req.body?.startTime) : undefined;

        const endTime =
            "endTime" in req.body ? parseTimeToDate(req.body?.endTime) : undefined;

        const peopleCount =
            "peopleCount" in req.body ? asOptionalInt(req.body?.peopleCount) : undefined;

        const note = "note" in req.body ? asTrimmedString(req.body?.note) : undefined;

        if (bookingDate === null) {
            return res.status(400).json({ error: "bookingDate/date must be YYYY-MM-DD" });
        }
        if (startTime === null) {
            return res.status(400).json({ error: "startTime must be HH:mm" });
        }
        if (endTime === null) {
            return res.status(400).json({ error: "endTime must be HH:mm" });
        }
        if (peopleCount !== undefined && peopleCount !== null && peopleCount <= 0) {
            return res.status(400).json({ error: "peopleCount must be > 0" });
        }

        const data: any = {};
        if (bookingDate !== undefined) data.bookingDate = bookingDate;
        if (startTime !== undefined) data.startTime = startTime;
        if (endTime !== undefined) data.endTime = endTime;
        if (peopleCount !== undefined) data.peopleCount = peopleCount;
        if (note !== undefined) data.note = note;

        const updated = await prisma.$transaction(async (tx) => {
            const booking = await tx.facilityBooking.update({
                where: { id: bookingId },
                data,
                include: {
                    tenant: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    room: { select: { id: true, roomNo: true } },
                    facility: { select: { id: true, facilityName: true } },
                },
            });

            await tx.facilityBookingUpdate.create({
                data: {
                    bookingId,
                    updateType: "COMMENT",
                    oldStatus: current.status as any,
                    newStatus: booking.status as any,
                    message: "Booking details updated by owner",
                    createdBy: ownerId,
                },
            });

            return booking;
        });

        return res.json(mapBookingRow(updated));
    } catch (err: any) {
        console.error("UPDATE BOOKING ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to update booking",
        });
    }
});

// DELETE /owner/bookings/:bookingId
router.delete("/bookings/:bookingId", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const bookingId = String(req.params.bookingId);
        await assertOwnerBookingOrThrow(ownerId, bookingId);

        await prisma.facilityBooking.delete({
            where: { id: bookingId },
        });

        return res.json({ ok: true });
    } catch (err: any) {
        console.error("DELETE BOOKING ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to delete booking",
        });
    }
});

/* =========================
   Optional: owner create booking manually
   ========================= */

// POST /owner/facilities/:facilityId/bookings
router.post("/facilities/:facilityId/bookings", async (req, res) => {
    try {
        const ownerId = getUserId(req);
        if (!ownerId) return res.status(401).json({ error: "Unauthorized" });

        const facilityId = String(req.params.facilityId);
        const facility = await assertOwnerFacilityOrThrow(ownerId, facilityId);

        const bookingDate = parseDateOnly(req.body?.date ?? req.body?.bookingDate);
        const startTime = parseTimeToDate(req.body?.startTime);
        const endTime = parseTimeToDate(req.body?.endTime);
        const roomId = asTrimmedString(req.body?.roomId);
        const tenantUserId = asTrimmedString(req.body?.tenantUserId);
        const peopleCount = asOptionalInt(req.body?.peopleCount);
        const note = asTrimmedString(req.body?.note);
        const requestedStatus = String(req.body?.status ?? "APPROVED").toUpperCase();

        if (!bookingDate) {
            return res.status(400).json({ error: "bookingDate/date is required (YYYY-MM-DD)" });
        }
        if (!startTime) {
            return res.status(400).json({ error: "startTime is required (HH:mm)" });
        }
        if (!endTime) {
            return res.status(400).json({ error: "endTime is required (HH:mm)" });
        }

        const status =
            requestedStatus === "PENDING" ||
                requestedStatus === "APPROVED" ||
                requestedStatus === "REJECTED" ||
                requestedStatus === "CANCELLED" ||
                requestedStatus === "COMPLETED"
                ? requestedStatus
                : "APPROVED";

        const created = await prisma.$transaction(async (tx) => {
            const booking = await tx.facilityBooking.create({
                data: {
                    condoId: facility.condoId,
                    facilityId,
                    roomId,
                    tenantUserId,
                    createdBy: ownerId,
                    bookingDate,
                    startTime,
                    endTime,
                    peopleCount,
                    note,
                    status: status as any,
                    approvedBy: status === "APPROVED" ? ownerId : null,
                    approvedAt: status === "APPROVED" ? new Date() : null,
                },
                include: {
                    tenant: { select: { id: true, name: true } },
                    creator: { select: { id: true, name: true } },
                    room: { select: { id: true, roomNo: true } },
                    facility: { select: { id: true, facilityName: true } },
                },
            });

            await tx.facilityBookingUpdate.create({
                data: {
                    bookingId: booking.id,
                    updateType: status === "APPROVED" ? "APPROVAL" : "COMMENT",
                    oldStatus: null,
                    newStatus: status as any,
                    message: "Booking created by owner",
                    createdBy: ownerId,
                },
            });

            return booking;
        });

        return res.status(201).json(mapBookingRow(created));
    } catch (err: any) {
        console.error("CREATE BOOKING ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to create booking",
        });
    }
});

router.get("/condos/:condoId/bookings", async (req, res) => {
    try {
        const condoId = String(req.params.condoId);

        const rows = await prisma.facilityBooking.findMany({
            where: {
                condoId,
            },
            include: {
                tenant: { select: { id: true, name: true } },
                room: { select: { id: true, roomNo: true } },
                facility: {
                    select: {
                        id: true,
                        facilityName: true,
                    },
                },
            },
            orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
        });

        return res.json(
            rows.map((row) => ({
                id: row.id,
                condoId: row.condoId,
                facilityId: row.facilityId,
                roomId: row.roomId,
                tenantUserId: row.tenantUserId,
                userName: row.tenant?.name ?? "-",
                unit: row.room?.roomNo ?? "-",
                facilityName: row.facility?.facilityName ?? "-",
                date: row.bookingDate,
                startTime: row.startTime,
                endTime: row.endTime,
                peopleCount: row.peopleCount ?? 1,
                note: row.note ?? "",
                status: row.status,
                approvedBy: row.approvedBy ?? null,
                approvedAt: row.approvedAt ?? null,
                rejectionReason: row.rejectReason ?? null,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt ?? null,
            }))
        );
    } catch (err: any) {
        console.error("GET CONDO BOOKINGS ERROR:", err);
        return res.status(500).json({
            error: err?.message ?? "Failed to fetch condo bookings",
        });
    }
});

export default router;