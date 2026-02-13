import "dotenv/config";
import bcrypt from "bcrypt";
import {
  Role,
  CondoType,
  RoomStatus,
  TenancyStatus,
  BookingStatus,
  ParcelStatus,
  RepairPriority,
  RepairStatus,
  PaymentMethod,
  PaymentStatus,
} from "@prisma/client";
import { prisma } from "../src/prisma";

// -------- helpers ----------
function roomNo(floor: number, idx: number) {
  // A101, A102 ... A506
  return `A${floor}${String(idx).padStart(2, "0")}`;
}

function monthPeriod(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

async function main() {
  const pw = await bcrypt.hash("123456", 10);

  // --------------------------
  // 0) clean some transactional tables (optional but helps rerun)
  // --------------------------
  // ลำดับต้องลบลูกก่อนแม่ (เพราะ FK)
  await prisma.chatMessage.deleteMany({});
  await prisma.chatMember.deleteMany({});
  await prisma.chatRoom.deleteMany({});

  await prisma.payment.deleteMany({});
  await prisma.invoiceItem.deleteMany({});
  await prisma.invoice.deleteMany({});

  await prisma.facilityBooking.deleteMany({});
  await prisma.facility.deleteMany({});

  await prisma.repairImage.deleteMany({});
  await prisma.repairNote.deleteMany({});
  await prisma.repairTicket.deleteMany({});

  await prisma.parcel.deleteMany({});
  await prisma.tenancy.deleteMany({});
  await prisma.room.deleteMany({});
  await prisma.building.deleteMany({});
  await prisma.ownerCondo.deleteMany({});
  await prisma.announcement.deleteMany({});
  await prisma.condo.deleteMany({});

  // --------------------------
  // 1) users
  // --------------------------
  const tenant = await prisma.user.upsert({
    where: { email: "tenant@rentsphere.com" },
    update: { name: "Test Tenant", role: Role.TENANT, passwordHash: pw, phone: "0652522958" },
    create: {
      email: "tenant@rentsphere.com",
      name: "Test Tenant",
      role: Role.TENANT,
      passwordHash: pw,
      phone: "0652522958",
    },
  });

  const tenant2 = await prisma.user.upsert({
    where: { email: "tenant2@rentsphere.com" },
    update: { name: "Second Tenant", role: Role.TENANT, passwordHash: pw, phone: "0811111111" },
    create: {
      email: "tenant2@rentsphere.com",
      name: "Second Tenant",
      role: Role.TENANT,
      passwordHash: pw,
      phone: "0811111111",
    },
  });

  const owner = await prisma.user.upsert({
    where: { email: "owner@rentsphere.com" },
    update: { name: "Condo Owner", role: Role.OWNER, passwordHash: pw, phone: "0987457326" },
    create: {
      email: "owner@rentsphere.com",
      name: "Condo Owner",
      role: Role.OWNER,
      passwordHash: pw,
      phone: "0987457326",
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: "admin@rentsphere.com" },
    update: { name: "System Admin", role: Role.ADMIN, passwordHash: pw, phone: "0999999999" },
    create: {
      email: "admin@rentsphere.com",
      name: "System Admin",
      role: Role.ADMIN,
      passwordHash: pw,
      phone: "0999999999",
    },
  });

  // --------------------------
  // 2) condo + owner link
  // --------------------------
  const condo = await prisma.condo.create({
    data: {
      name: "RentSphere Residence",
      type: CondoType.CONDO,
      address: "123/45 Example Road",
      city: "Bangkok",
      province: "Bangkok",
    },
  });

  await prisma.ownerCondo.create({
    data: {
      ownerId: owner.id,
      condoId: condo.id,
    },
  });

  // --------------------------
  // 3) buildings
  // --------------------------
  const buildingA = await prisma.building.create({
    data: { condoId: condo.id, name: "Building A" },
  });

  // --------------------------
  // 4) rooms (5 floors x 6 rooms)
  // --------------------------
  const floorCount = 5;
  const roomsPerFloor = 6;

  const rooms = [];
  for (let f = 1; f <= floorCount; f++) {
    for (let i = 1; i <= roomsPerFloor; i++) {
      rooms.push({
        condoId: condo.id,
        number: roomNo(f, i),
        floor: f,
        type: i <= 3 ? "STUDIO" : "1BR",
        price: i <= 3 ? 6500 : 8500,
        status: RoomStatus.AVAILABLE,
      });
    }
  }

  await prisma.room.createMany({ data: rooms });

  // fetch two rooms for tenants
  const a101 = await prisma.room.findUnique({
    where: { condoId_number: { condoId: condo.id, number: "A101" } },
  });
  const a102 = await prisma.room.findUnique({
    where: { condoId_number: { condoId: condo.id, number: "A102" } },
  });

  if (!a101 || !a102) throw new Error("Rooms A101/A102 not found after createMany");

  // --------------------------
  // 5) tenancies + set currentTenancyId
  // --------------------------
  const tenancy1 = await prisma.tenancy.create({
    data: {
      tenantId: tenant.id,
      condoId: condo.id,
      roomId: a101.id,
      status: TenancyStatus.ACTIVE,
      startDate: new Date(),
    },
  });

  const tenancy2 = await prisma.tenancy.create({
    data: {
      tenantId: tenant2.id,
      condoId: condo.id,
      roomId: a102.id,
      status: TenancyStatus.ACTIVE,
      startDate: new Date(),
    },
  });

  await prisma.room.update({ where: { id: a101.id }, data: { status: RoomStatus.OCCUPIED } });
  await prisma.room.update({ where: { id: a102.id }, data: { status: RoomStatus.OCCUPIED } });

  await prisma.user.update({ where: { id: tenant.id }, data: { currentTenancyId: tenancy1.id } });
  await prisma.user.update({ where: { id: tenant2.id }, data: { currentTenancyId: tenancy2.id } });

  // --------------------------
  // 6) facilities
  // --------------------------
  const pool = await prisma.facility.create({
    data: {
      condoId: condo.id,
      name: "สระว่ายน้ำ",
      description: "เปิดทุกวัน",
      openTime: "06:00",
      closeTime: "22:00",
    },
  });

  const gym = await prisma.facility.create({
    data: {
      condoId: condo.id,
      name: "ฟิตเนส",
      description: "ห้องออกกำลังกาย",
      openTime: "06:00",
      closeTime: "23:00",
    },
  });

  const meeting = await prisma.facility.create({
    data: {
      condoId: condo.id,
      name: "ห้องประชุม",
      description: "จองล่วงหน้าได้",
      openTime: "09:00",
      closeTime: "20:00",
    },
  });

  // --------------------------
  // 7) facility booking sample
  // --------------------------
  const now = new Date();
  const startAt = new Date(now.getTime() + 60 * 60 * 1000);
  const endAt = new Date(now.getTime() + 2 * 60 * 60 * 1000);

  await prisma.facilityBooking.create({
    data: {
      condoId: condo.id,
      facilityId: pool.id,
      userId: tenant.id,
      startAt,
      endAt,
      status: BookingStatus.CONFIRMED,
      note: "ขอจอง 1 ชั่วโมง",
    },
  });

  // --------------------------
  // 8) repair tickets (+ images/notes)
  // --------------------------
  const ticket = await prisma.repairTicket.create({
    data: {
      condoId: condo.id,
      roomId: a101.id,
      createdById: tenant.id,
      category: "แอร์",
      location: "ห้องนอน",
      description: "แอร์ไม่เย็น เปิดแล้วลมออกแต่ไม่เย็น",
      priority: RepairPriority.HIGH,
      status: RepairStatus.OPEN,
    },
  });

  await prisma.repairImage.createMany({
    data: [
      { ticketId: ticket.id, url: "https://picsum.photos/seed/repair1/600/400" },
      { ticketId: ticket.id, url: "https://picsum.photos/seed/repair2/600/400" },
    ],
  });

  await prisma.repairNote.createMany({
    data: [
      { ticketId: ticket.id, message: "รับเรื่องแล้ว กำลังประสานช่าง" },
      { ticketId: ticket.id, message: "นัดเข้าตรวจพรุ่งนี้ 10:00" },
    ],
  });

  // --------------------------
  // 9) parcels
  // --------------------------
  await prisma.parcel.createMany({
    data: [
      {
        condoId: condo.id,
        userId: tenant.id,
        tracking: "TH1234567890",
        carrier: "ไปรษณีย์ไทย",
        status: ParcelStatus.ARRIVED,
        note: "ฝากที่นิติ",
        arrivedAt: new Date(),
      },
      {
        condoId: condo.id,
        userId: tenant2.id,
        tracking: "FLASH-99887766",
        carrier: "Flash",
        status: ParcelStatus.INCOMING,
        note: "กำลังนำส่ง",
      },
    ],
  });

  // --------------------------
  // 10) invoices + items
  // --------------------------
  const period = monthPeriod();
  const dueDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const inv1 = await prisma.invoice.create({
    data: {
      condoId: condo.id,
      tenantId: tenant.id,
      period,
      dueDate,
      total: 0, // เดี๋ยวอัปเดตตาม items
      status: PaymentStatus.PENDING,
    },
  });

  const items1 = [
    { invoiceId: inv1.id, name: "ค่าเช่า", amount: 8500 },
    { invoiceId: inv1.id, name: "ค่าส่วนกลาง", amount: 1500 },
    { invoiceId: inv1.id, name: "ค่าน้ำ", amount: 250 },
    { invoiceId: inv1.id, name: "ค่าไฟ", amount: 620 },
  ];

  await prisma.invoiceItem.createMany({ data: items1 });

  const total1 = items1.reduce((s, it) => s + it.amount, 0);
  await prisma.invoice.update({ where: { id: inv1.id }, data: { total: total1 } });

  // --------------------------
  // 11) payments (ผูก invoice)
  // --------------------------
  const pay1 = await prisma.payment.create({
    data: {
      condoId: condo.id,
      userId: tenant.id,
      invoiceId: inv1.id,
      amount: total1,
      method: PaymentMethod.TRANSFER,
      status: PaymentStatus.PAID,
      note: "โอนแล้ว แนบสลิป",
      paidAt: new Date(),
    },
  });

  // อัปเดต invoice เป็น PAID
  await prisma.invoice.update({
    where: { id: inv1.id },
    data: { status: PaymentStatus.PAID },
  });

  // --------------------------
  // 12) chat (room + members + messages)
  // --------------------------
  const chat = await prisma.chatRoom.create({
    data: {
      condoId: condo.id,
      name: "ติดต่อเจ้าของหอ",
      createdById: tenant.id,
    },
  });

  await prisma.chatMember.createMany({
    data: [
      { roomId: chat.id, userId: tenant.id },
      { roomId: chat.id, userId: owner.id },
      { roomId: chat.id, userId: admin.id },
    ],
  });

  await prisma.chatMessage.createMany({
    data: [
      { roomId: chat.id, userId: tenant.id, content: "สวัสดีค่ะ ขอสอบถามเรื่องค่าส่วนกลางหน่อยค่ะ" },
      { roomId: chat.id, userId: owner.id, content: "ได้เลยครับ เดือนนี้ 1,500 บาทครับ" },
      { roomId: chat.id, userId: admin.id, content: "ถ้าต้องการใบแจ้งหนี้ สามารถดูในเมนูชำระเงินได้เลยครับ" },
    ],
  });

  // --------------------------
  // 13) announcements
  // --------------------------
  await prisma.announcement.createMany({
    data: [
      {
        condoId: condo.id,
        title: "แจ้งปิดสระว่ายน้ำ",
        content: "ปิดปรับปรุงวันที่ 20-22 ก.พ. ขออภัยในความไม่สะดวก",
        createdById: owner.id,
        publishedAt: new Date(),
      },
      {
        condoId: condo.id,
        title: "ซ้อมอพยพหนีไฟ",
        content: "วันที่ 1 มี.ค. เวลา 10:00 ณ ลานจอดรถ",
        createdById: admin.id,
        publishedAt: new Date(),
      },
    ],
  });

  console.log("✅ Seed done (FULL)");
  console.log({
    condo: condo.name,
    owner: owner.email,
    tenants: [tenant.email, tenant2.email],
    sampleRoom: ["A101", "A102"],
    invoice: inv1.id,
    payment: pay1.id,
    chatRoom: chat.name,
    facilities: [pool.name, gym.name, meeting.name],
  });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => prisma.$disconnect());
