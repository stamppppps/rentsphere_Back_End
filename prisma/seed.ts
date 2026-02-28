import bcrypt from "bcrypt";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
 
  console.log("🌱 Seeding start...");
  
  console.log("✅ Seeding done.");
  await prisma.verifyRequest.deleteMany().catch(() => {});
  await prisma.passwordResetRequest.deleteMany().catch(() => {});
  await prisma.user.deleteMany().catch(() => {});

  const passwordPlain = "P@ssw0rd1234";
  const passwordHash = await bcrypt.hash(passwordPlain, 10);


  const owner = await prisma.user.create({
    data: {
      email: "owner@test.com",
      phone: "0999999999",
      passwordHash,
      role: "OWNER",
      name: "Owner Seed",
      verifyChannel: "EMAIL",
      emailVerifiedAt: new Date(),
      
      isActive: true,
    } as any,
  });

 
  const tenant = await prisma.user.create({
    data: {
      email: "tenant@test.com",
      phone: "0888888888",
      passwordHash,
      role: "TENANT",
      name: "Tenant Seed",
      verifyChannel: "PHONE",
      phoneVerifiedAt: new Date(),
      isActive: true,
    } as any,
  });


  const admin = await prisma.user.create({
    data: {
      email: "admin@test.com",
      phone: "0777777777",
      passwordHash,
      role: "ADMIN",
      name: "Admin Seed",
      verifyChannel: "EMAIL",
      emailVerifiedAt: new Date(),
      isActive: true,
    } as any,
  });

  console.log("✅ Seed done");
  console.log("Login password for all users:", passwordPlain);
  console.log("OWNER :", { id: owner.id, email: owner.email, phone: owner.phone });
  console.log("TENANT:", { id: tenant.id, email: tenant.email, phone: tenant.phone });
  console.log("ADMIN :", { id: admin.id, email: admin.email, phone: admin.phone });
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });