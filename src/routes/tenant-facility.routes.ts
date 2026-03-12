import { Router } from "express";
import { prisma } from "../prisma.js";

const router = Router();

async function pushLineMessage(lineUserId: string, text: string) {
    const token =
        process.env.LINE_MESSAGING_ACCESS_TOKEN ||
        process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
        console.error("LINE token is not configured");
        return;
    }

    try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                to: lineUserId,
                messages: [{ type: "text", text }],
            }),
        });

        if (!res.ok) {
            console.error("LINE push error:", await res.text());
        }
    } catch (err) {
        console.error("LINE push exception:", err);
    }
}

async function pushLineFlexMessage(lineUserId: string, altText: string, bubble: any) {
    const token =
        process.env.LINE_MESSAGING_ACCESS_TOKEN ||
        process.env.LINE_CHANNEL_ACCESS_TOKEN;

    if (!token) {
        console.error("LINE token is not configured");
        return;
    }

    try {
        const res = await fetch("https://api.line.me/v2/bot/message/push", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
                to: lineUserId,
                messages: [
                    {
                        type: "flex",
                        altText,
                        contents: bubble,
                    },
                ],
            }),
        });

        if (!res.ok) {
            console.error("LINE flex push error:", await res.text());
        }
    } catch (err) {
        console.error("LINE flex push exception:", err);
    }
}

function combineDateAndTime(dateOnly: Date, timeOnly: Date) {
    return new Date(
        dateOnly.getFullYear(),
        dateOnly.getMonth(),
        dateOnly.getDate(),
        timeOnly.getHours(),
        timeOnly.getMinutes(),
        timeOnly.getSeconds(),
        0
    );
}

function getDurationMinutes(startTime: Date, endTime: Date) {
    return Math.floor((endTime.getTime() - startTime.getTime()) / (1000 * 60));
}

function sortTimeRange(startTime: Date, endTime: Date) {
    if (startTime <= endTime) {
        return { sortedStartTime: startTime, sortedEndTime: endTime };
    }

    return { sortedStartTime: endTime, sortedEndTime: startTime };
}

function isPastBookingStart(dateOnly: Date, startTime: Date) {
    return combineDateAndTime(dateOnly, startTime).getTime() <= Date.now();
}

function isWithin30Minutes(dateOnly: Date, startTime: Date) {
    const startAt = combineDateAndTime(dateOnly, startTime).getTime();
    const diff = startAt - Date.now();
    return diff > 0 && diff < 30 * 60 * 1000;
}

function splitBookingSlots(startTime: Date, endTime: Date, slotMinutes: number) {
    const slots: Array<{ startTime: Date; endTime: Date }> = [];

    let cursor = new Date(startTime);

    while (cursor < endTime) {
        const next = new Date(cursor.getTime() + slotMinutes * 60 * 1000);
        if (next > endTime) break;

        slots.push({
            startTime: new Date(cursor),
            endTime: new Date(next),
        });

        cursor = next;
    }

    return slots;
}

function buildBookingSuccessFlex(params: {
    facilityName: string;
    date: string;
    startTime: string;
    endTime: string;
    roomNo?: string | null;
    coverImageUrl?: string | null;
}) {
    const heroUrl =
        params.coverImageUrl ||
        "https://images.unsplash.com/photo-1517457373958-b7bdd4587205?auto=format&fit=crop&w=1200&q=80";

    return {
        type: "bubble",
        hero: {
            type: "image",
            url: heroUrl,
            size: "full",
            aspectRatio: "20:13",
            aspectMode: "cover",
        },
        body: {
            type: "box",
            layout: "vertical",
            spacing: "md",
            contents: [
                {
                    type: "text",
                    text: "จองสำเร็จ",
                    weight: "bold",
                    size: "xl",
                    color: "#135ced",
                },
                {
                    type: "text",
                    text: params.facilityName,
                    weight: "bold",
                    size: "lg",
                    wrap: true,
                },
                {
                    type: "separator",
                    margin: "md",
                },
                {
                    type: "box",
                    layout: "vertical",
                    margin: "md",
                    spacing: "sm",
                    contents: [
                        {
                            type: "text",
                            text: `วันที่: ${params.date}`,
                            size: "sm",
                            color: "#555555",
                        },
                        {
                            type: "text",
                            text: `เวลา: ${params.startTime} - ${params.endTime}`,
                            size: "sm",
                            color: "#555555",
                        },
                        {
                            type: "text",
                            text: `ห้อง: ${params.roomNo ?? "-"}`,
                            size: "sm",
                            color: "#555555",
                        },
                    ],
                },
            ],
        },
        footer: {
            type: "box",
            layout: "vertical",
            spacing: "sm",
            contents: [
                {
                    type: "text",
                    text: "โปรดมาตรงเวลา",
                    align: "center",
                    color: "#135ced",
                    weight: "bold",
                    size: "sm",
                },
            ],
        },
    };
}

function scheduleLineNotifications(
    lineUserId: string,
    facilityName: string,
    bookingDate: Date,
    startTime: Date,
    endTime: Date
) {
    const startDateTime = combineDateAndTime(bookingDate, startTime);
    const endDateTime = combineDateAndTime(bookingDate, endTime);
    const now = Date.now();

    const beforeStart = startDateTime.getTime() - 30 * 60 * 1000;
    if (beforeStart > now) {
        setTimeout(() => {
            pushLineMessage(
                lineUserId,
                `⏰ เตือนก่อนใช้งาน\n${facilityName}\nอีก 30 นาทีจะถึงเวลาที่จองไว้`
            );
        }, beforeStart - now);
    }

    const beforeEnd = endDateTime.getTime() - 10 * 60 * 1000;
    if (beforeEnd > now) {
        setTimeout(() => {
            pushLineMessage(
                lineUserId,
                `⌛ เตือนก่อนหมดเวลา\n${facilityName}\nอีก 10 นาทีจะหมดเวลาการใช้งาน`
            );
        }, beforeEnd - now);
    }
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

function parseDateOnly(value: any): Date | null {
    if (typeof value !== "string") return null;

    const [y, m, d] = value.split("-").map(Number);

    return new Date(Date.UTC(y, m - 1, d));
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
        imageUrl: row.coverImageUrl ?? null,
        isActive: row.isActive,
        status: mapFacilityStatus(row.isActive),
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
        facilityName: row.facility?.facilityName ?? "-",
        imageUrl: row.facility?.coverImageUrl ?? null,
        coverImageUrl: row.facility?.coverImageUrl ?? null,
        roomId: row.roomId ?? null,
        unit: row.room?.roomNo ?? "-",
        tenantUserId: row.tenantUserId ?? null,
        userName: row.tenant?.name ?? "-",
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

async function getUserIdFromLineUserId(lineUserId: string) {
    const lineAccount = await prisma.lineAccount.findUnique({
        where: { lineUserId },
        select: {
            userId: true,
            isActive: true,
        },
    });

    if (!lineAccount?.userId || lineAccount.isActive === false) {
        const err: any = new Error("LINE account not found");
        err.status = 404;
        throw err;
    }

    return lineAccount.userId;
}

async function getActiveResidenciesByLineUserId(lineUserId: string) {
    const userId = await getUserIdFromLineUserId(lineUserId);

    const residencies = await prisma.tenantResidency.findMany({
        where: {
            tenantUserId: userId,
            status: "ACTIVE",
        },
        select: {
            id: true,
            condoId: true,
            roomId: true,
            tenantUserId: true,
        },
    });

    return { userId, residencies };
}

async function assertPublicFacilityAccessOrThrow(lineUserId: string, facilityId: string) {
    const userId = await getUserIdFromLineUserId(lineUserId);

    const facility = await prisma.facility.findUnique({
        where: { id: facilityId },
        select: {
            id: true,
            condoId: true,
            isActive: true,
            facilityName: true,
            bookingSetting: true,
        },
    });

    if (!facility) {
        const err: any = new Error("Facility not found");
        err.status = 404;
        throw err;
    }

    const residency = await prisma.tenantResidency.findFirst({
        where: {
            tenantUserId: userId,
            condoId: facility.condoId,
            status: "ACTIVE",
        },
        select: {
            id: true,
            condoId: true,
            roomId: true,
            tenantUserId: true,
        },
    });

    if (!residency) {
        const err: any = new Error("Forbidden (not resident in this condo)");
        err.status = 403;
        throw err;
    }

    return { userId, facility, residency };
}

/* =========================================
   GET /tenant-public/facilities?lineUserId=xxx
   ========================================= */
router.get("/facilities", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.query.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const { residencies } = await getActiveResidenciesByLineUserId(lineUserId);

        const condoIds = Array.from(
            new Set(residencies.map((r) => r.condoId).filter(Boolean))
        );

        if (condoIds.length === 0) {
            return res.json([]);
        }

        const rows = await prisma.facility.findMany({
            where: {
                condoId: { in: condoIds },
            },
            include: {
                bookingSetting: true,
            },
            orderBy: { createdAt: "asc" },
        });

        return res.json(rows.map(mapFacilityRow));
    } catch (err: any) {
        console.error("TENANT PUBLIC LIST FACILITIES ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch facilities",
        });
    }
});

/* =========================================
   GET /tenant-public/facilities/:facilityId?lineUserId=xxx
   ========================================= */
router.get("/facilities/:facilityId", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.query.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const facilityId = String(req.params.facilityId);
        await assertPublicFacilityAccessOrThrow(lineUserId, facilityId);

        const row = await prisma.facility.findUnique({
            where: { id: facilityId },
            include: { bookingSetting: true },
        });

        if (!row) {
            return res.status(404).json({ error: "Facility not found" });
        }

        return res.json(mapFacilityRow(row));
    } catch (err: any) {
        console.error("TENANT PUBLIC GET FACILITY DETAIL ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch facility detail",
        });
    }
});

/* =========================================
   GET /tenant-public/facilities/:facilityId/slots?lineUserId=xxx&date=YYYY-MM-DD
   ========================================= */
router.get("/facilities/:facilityId/slots", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.query.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const facilityId = String(req.params.facilityId);

        const { facility } = await assertPublicFacilityAccessOrThrow(
            lineUserId,
            facilityId
        );

        const bookingDate = parseDateOnly(req.query?.date);
        if (!bookingDate) {
            return res.status(400).json({
                error: "date is required (YYYY-MM-DD)",
            });
        }

        const setting = facility.bookingSetting;
        if (!setting) {
            return res.status(400).json({
                error: "Facility booking setting not found",
            });
        }

        const openTime = setting.openTime;
        const closeTime = setting.closeTime;

        if (!openTime || !closeTime) {
            return res.status(400).json({
                error: "Facility booking setting time is not configured",
            });
        }

        const slotMinutes = setting.slotMinutes ?? 60;
        const maxPeople = setting.maxPeople ?? 1;

        const existingBookings = await prisma.facilityBooking.findMany({
            where: {
                facilityId,
                bookingDate,
                status: { in: ["PENDING", "APPROVED", "COMPLETED"] as any },
            },
            select: {
                id: true,
                startTime: true,
                endTime: true,
                peopleCount: true,
            },
            orderBy: { startTime: "asc" },
        });

        const slots: Array<{
            startTime: string;
            endTime: string;
            available: boolean;
            currentPeople: number;
            maxPeople: number;
        }> = [];

        let cursor = new Date(openTime);
        const close = new Date(closeTime);

        while (cursor < close) {
            const slotStart = new Date(cursor);
            const slotEnd = new Date(cursor.getTime() + slotMinutes * 60 * 1000);

            if (slotEnd > close) break;

            const overlappedBookings = existingBookings.filter((b) => {
                return slotStart < b.endTime && slotEnd > b.startTime;
            });

            const usedPeople = overlappedBookings.reduce((sum, b) => {
                return sum + (b.peopleCount ?? 1);
            }, 0);

            const available =
                facility.isActive &&
                usedPeople < maxPeople &&
                !isPastBookingStart(bookingDate, slotStart) &&
                !isWithin30Minutes(bookingDate, slotStart);

            slots.push({
                startTime: timeToHHMM(slotStart)!,
                endTime: timeToHHMM(slotEnd)!,
                available,
                currentPeople: usedPeople,
                maxPeople,
            });

            cursor = slotEnd;
        }

        return res.json({
            facilityId,
            date: dateToYYYYMMDD(bookingDate),
            slots,
        });
    } catch (err: any) {
        console.error("TENANT PUBLIC GET FACILITY SLOTS ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch facility slots",
        });
    }
});

/* =========================================
   POST /tenant-public/facilities/:facilityId/bookings
   body: { lineUserId, date, startTime, endTime, peopleCount?, note? }
   ========================================= */
router.post("/facilities/:facilityId/bookings", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.body?.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const facilityId = String(req.params.facilityId);
        const { userId, facility, residency } = await assertPublicFacilityAccessOrThrow(
            lineUserId,
            facilityId
        );

        if (!facility.isActive) {
            return res.status(400).json({ error: "Facility is under maintenance" });
        }

        const bookingDate = parseDateOnly(req.body?.date ?? req.body?.bookingDate);
        const rawStartTime = parseTimeToDate(req.body?.startTime);
        const rawEndTime = parseTimeToDate(req.body?.endTime);
        const peopleCount = asOptionalInt(req.body?.peopleCount) ?? 1;
        const note = asTrimmedString(req.body?.note);

        if (!bookingDate) {
            return res
                .status(400)
                .json({ error: "bookingDate/date is required (YYYY-MM-DD)" });
        }

        if (!rawStartTime) {
            return res.status(400).json({ error: "startTime is required (HH:mm)" });
        }

        if (!rawEndTime) {
            return res.status(400).json({ error: "endTime is required (HH:mm)" });
        }

        if (peopleCount <= 0) {
            return res.status(400).json({ error: "peopleCount must be > 0" });
        }

        const { sortedStartTime: startTime, sortedEndTime: endTime } = sortTimeRange(
            rawStartTime,
            rawEndTime
        );

        if (endTime <= startTime) {
            return res
                .status(400)
                .json({ error: "endTime must be later than startTime" });
        }

        const durationMinutes = getDurationMinutes(startTime, endTime);
        if (durationMinutes > 120) {
            return res.status(400).json({
                error: "ไม่สามารถจองเกิน 2 ชั่วโมงได้",
            });
        }

        if (isPastBookingStart(bookingDate, startTime)) {
            return res.status(400).json({
                error: "ไม่สามารถจองได้",
            });
        }

        if (isWithin30Minutes(bookingDate, startTime)) {
            return res.status(400).json({
                error: "กรุณาเลือกรอบถัดไป",
            });
        }

        const setting = facility.bookingSetting;

        if (!setting || !setting.openTime || !setting.closeTime) {
            return res.status(400).json({
                error: "Facility booking setting is incomplete",
            });
        }

        const openTime = setting.openTime;
        const closeTime = setting.closeTime;

        if (startTime < openTime || endTime > closeTime) {
            return res.status(400).json({
                error: "Booking time is outside facility operating hours",
            });
        }

        const maxBookingsPerDay = setting.maxBookingsPerDay ?? 2;
        const status = "APPROVED";

        const created = await prisma.$transaction(async (tx) => {
            // 1) สิทธิ์ต่อห้อง / วัน (รวมทุก facility ในคอนโด)
            const countPerDay = await tx.facilityBooking.count({
                where: {
                    condoId: facility.condoId,
                    roomId: residency.roomId ?? null,
                    bookingDate,
                    status: { in: ["PENDING", "APPROVED", "COMPLETED"] as any },
                },
            });

            if (countPerDay >= maxBookingsPerDay) {
                const err: any = new Error(
                    `ห้องนี้ใช้สิทธิ์ครบ ${maxBookingsPerDay} ครั้งสำหรับวันนี้แล้ว`
                );
                err.status = 400;
                throw err;
            }

            // 2) กัน slot ซ้อนใน transaction
            const existingConflict = await tx.facilityBooking.findFirst({
                where: {
                    facilityId,
                    bookingDate,
                    status: { in: ["PENDING", "APPROVED", "COMPLETED"] as any },
                    AND: [
                        { startTime: { lt: endTime } },
                        { endTime: { gt: startTime } },
                    ],
                },
                select: { id: true },
            });

            if (existingConflict) {
                const err: any = new Error("Selected time slot is already booked");
                err.status = 409;
                throw err;
            }

            // 3) เช็กจำนวนคนรวมของช่วงเวลาที่ทับกัน
            if (setting.maxPeople !== null && setting.maxPeople > 0) {
                const overlapBookings = await tx.facilityBooking.findMany({
                    where: {
                        facilityId,
                        bookingDate,
                        status: { in: ["PENDING", "APPROVED", "COMPLETED"] as any },
                        AND: [
                            { startTime: { lt: endTime } },
                            { endTime: { gt: startTime } },
                        ],
                    },
                    select: {
                        peopleCount: true,
                    },
                });

                const usedPeople = overlapBookings.reduce((sum, b) => {
                    return sum + (b.peopleCount ?? 1);
                }, 0);

                if (usedPeople + peopleCount > setting.maxPeople) {
                    const err: any = new Error("ช่วงเวลานี้มีผู้จองครบจำนวนแล้ว");
                    err.status = 409;
                    throw err;
                }
            }

            // 4) สร้าง booking
            const booking = await tx.facilityBooking.create({
                data: {
                    condoId: facility.condoId,
                    facilityId,
                    roomId: residency.roomId ?? null,
                    tenantUserId: userId,
                    createdBy: userId,
                    bookingDate,
                    startTime,
                    endTime,
                    peopleCount,
                    note,
                    status: status as any,
                    approvedBy: userId,
                    approvedAt: new Date(),
                },
                include: {
                    tenant: { select: { id: true, name: true } },
                    room: { select: { id: true, roomNo: true } },
                    facility: {
                        select: {
                            id: true,
                            facilityName: true,
                            coverImageUrl: true,
                        },
                    },
                },
            });

            await tx.facilityBookingUpdate.create({
                data: {
                    bookingId: booking.id,
                    updateType: "APPROVAL",
                    oldStatus: null,
                    newStatus: status as any,
                    message: "Booking created and auto-approved",
                    createdBy: userId,
                },
            });

            return booking;
        });

        // 5) ส่ง LINE หลัง transaction สำเร็จ
        await pushLineFlexMessage(
            lineUserId,
            "จองพื้นที่ส่วนกลางสำเร็จ",
            buildBookingSuccessFlex({
                facilityName: created.facility?.facilityName ?? facility.facilityName,
                date: dateToYYYYMMDD(bookingDate) ?? "-",
                startTime: timeToHHMM(startTime) ?? "-",
                endTime: timeToHHMM(endTime) ?? "-",
                roomNo: created.room?.roomNo ?? "-",
                coverImageUrl: created.facility?.coverImageUrl ?? null,
            })
        );

        scheduleLineNotifications(
            lineUserId,
            created.facility?.facilityName ?? facility.facilityName,
            bookingDate,
            startTime,
            endTime
        );

        return res.status(201).json(mapBookingRow(created));
    } catch (err: any) {
        console.error("TENANT PUBLIC CREATE BOOKING ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to create booking",
        });
    }
});

/* =========================================
   GET /tenant-public/bookings/me?lineUserId=xxx
   ========================================= */
router.get("/bookings/me", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.query.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const userId = await getUserIdFromLineUserId(lineUserId);

        const rows = await prisma.facilityBooking.findMany({
            where: {
                tenantUserId: userId,
            },
            include: {
                tenant: { select: { id: true, name: true } },
                room: { select: { id: true, roomNo: true } },
                facility: {
                    select: {
                        id: true,
                        facilityName: true,
                        coverImageUrl: true,
                    },
                },
            },
            orderBy: [{ bookingDate: "desc" }, { startTime: "desc" }],
        });

        return res.json(
            rows.map((row) => ({
                ...mapBookingRow(row),
                imageUrl: row.facility?.coverImageUrl ?? null,
                coverImageUrl: row.facility?.coverImageUrl ?? null,
            }))
        );
    } catch (err: any) {
        console.error("TENANT PUBLIC LIST MY BOOKINGS ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch bookings",
        });
    }
});

/* =========================================
   PATCH /tenant-public/bookings/:bookingId/cancel
   body: { lineUserId }
   ========================================= */
router.patch("/bookings/:bookingId/cancel", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.body?.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const userId = await getUserIdFromLineUserId(lineUserId);
        const bookingId = String(req.params.bookingId);

        const booking = await prisma.facilityBooking.findFirst({
            where: {
                id: bookingId,
                tenantUserId: userId,
            },
            include: {
                facility: {
                    select: {
                        id: true,
                        bookingSetting: true,
                    },
                },
            },
        });

        if (!booking) {
            return res.status(404).json({ error: "Booking not found" });
        }

        if (booking.status === "CANCELLED") {
            return res.status(400).json({ error: "Booking already cancelled" });
        }

        const updated = await prisma.$transaction(async (tx) => {
            const row = await tx.facilityBooking.update({
                where: { id: bookingId },
                data: {
                    status: "CANCELLED" as any,
                },
                include: {
                    tenant: { select: { id: true, name: true } },
                    room: { select: { id: true, roomNo: true } },
                    facility: {
                        select: {
                            id: true,
                            facilityName: true,
                            coverImageUrl: true,
                        },
                    },
                },
            });

            await tx.facilityBookingUpdate.create({
                data: {
                    bookingId,
                    updateType: "STATUS_CHANGE",
                    oldStatus: booking.status as any,
                    newStatus: "CANCELLED" as any,
                    message: "Booking cancelled by tenant (public)",
                    createdBy: userId,
                },
            });

            return row;
        });

        return res.json(mapBookingRow(updated));
    } catch (err: any) {
        console.error("TENANT PUBLIC CANCEL BOOKING ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to cancel booking",
        });
    }
});

/* =========================================
   GET /tenant-public/facilities/:facilityId/booking-summary?lineUserId=xxx&date=YYYY-MM-DD
   ========================================= */
router.get("/facilities/:facilityId/booking-summary", async (req, res) => {
    try {
        const lineUserId = asTrimmedString(req.query.lineUserId);
        if (!lineUserId) {
            return res.status(400).json({ error: "lineUserId is required" });
        }

        const facilityId = String(req.params.facilityId);
        const { facility } = await assertPublicFacilityAccessOrThrow(
            lineUserId,
            facilityId
        );

        const bookingDate = parseDateOnly(req.query?.date);
        if (!bookingDate) {
            return res.status(400).json({
                error: "date is required (YYYY-MM-DD)",
            });
        }

        const rows = await prisma.facilityBooking.findMany({
            where: {
                facilityId,
                bookingDate,
                status: { in: ["PENDING", "APPROVED", "COMPLETED"] as any },
            },
            select: {
                id: true,
                startTime: true,
                endTime: true,
                peopleCount: true,
            },
            orderBy: { startTime: "asc" },
        });

        return res.json({
            facilityId,
            date: dateToYYYYMMDD(bookingDate),
            bookedCount: rows.length,
            bookedPeople: rows.reduce((sum, row) => sum + (row.peopleCount ?? 1), 0),
            items: rows.map((row) => ({
                id: row.id,
                startTime: timeToHHMM(row.startTime),
                endTime: timeToHHMM(row.endTime),
                peopleCount: row.peopleCount ?? 1,
            })),
        });
    } catch (err: any) {
        console.error("TENANT PUBLIC BOOKING SUMMARY ERROR:", err);
        return res.status(err?.status ?? 500).json({
            error: err?.message ?? "Failed to fetch booking summary",
        });
    }
});

export default router;