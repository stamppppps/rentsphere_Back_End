/**
 * reset-tenants.ts
 * ลบข้อมูลผู้เช่าที่ลิงก์ผ่าน LINE / gen code ออกจาก DB ทั้งหมด
 *
 * วิธีใช้:
 *   npx tsx scripts/reset-tenants.ts
 *
 * หรือถ้ายังไม่มี tsx:
 *   npx -y tsx scripts/reset-tenants.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
    console.log("🔄 Starting tenant data cleanup...\n");

    // 1. Delete all TenantOnboardingEvents
    const onboarding = await prisma.tenantOnboardingEvent.deleteMany({});
    console.log(`✅ Deleted ${onboarding.count} TenantOnboardingEvent(s)`);

    // 2. Delete all Invoices (billing data)
    const invoices = await prisma.invoice.deleteMany({});
    console.log(`✅ Deleted ${invoices.count} Invoice(s)`);

    // 3. Delete all TenantResidency records
    const residencies = await prisma.tenantResidency.deleteMany({});
    console.log(`✅ Deleted ${residencies.count} TenantResidency(ies)`);

    // 4. Delete all LineAccount links
    const lineAccounts = await prisma.lineAccount.deleteMany({});
    console.log(`✅ Deleted ${lineAccounts.count} LineAccount(s)`);

    // 5. Reset all TenantRoomCodes back to ACTIVE
    const roomCodes = await prisma.tenantRoomCode.updateMany({
        where: { status: "USED" },
        data: { status: "ACTIVE", usedAt: null, usedByUserId: null },
    });
    console.log(`✅ Reset ${roomCodes.count} TenantRoomCode(s) back to ACTIVE`);

    // 6. Reset all rooms to VACANT
    const rooms = await prisma.room.updateMany({
        where: { occupancyStatus: "OCCUPIED" },
        data: { occupancyStatus: "VACANT" },
    });
    console.log(`✅ Reset ${rooms.count} Room(s) to VACANT`);

    // 7. Delete MeterReadings (optional — clean billing data)
    const meters = await prisma.meterReading.deleteMany({});
    console.log(`✅ Deleted ${meters.count} MeterReading(s)`);

    console.log("\n🎉 Done! All tenant data has been cleaned up.");
    console.log("   Rooms are now VACANT, LINE accounts unlinked, codes reset.\n");
}

main()
    .catch((e) => {
        console.error("❌ Error:", e);
        process.exit(1);
    })
    .finally(() => prisma.$disconnect());
