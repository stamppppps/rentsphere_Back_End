import "dotenv/config";
import { prisma } from "../src/prisma";

async function main(){
  await prisma.user.upsert({
    where: { email:"tenant@rentsphere.com"},
    update: { name:"Test Tenant",role:"TENANT"},
    create: { email:"tenant@rentsphere.com",name:"Test Tenant",role:"TENANT"},
  });

  await prisma.user.upsert({
    where: { email: "owner@rentsphere.com" },
    update: { name: "Condo Owner", role: "OWNER"},
    create: { email: "owner@rentsphere.com",name:"Condo Owner",role:"OWNER" },
  });

  await prisma.user.upsert({
    where: { email:"admin@rentsphere.com" },
    update: { name:"System Admin",role:"ADMIN" },
    create: { email:"admin@rentsphere.com",name:"System Admin",role:"ADMIN" },
  });

  console.log("✅ Seed done (TENANT+OWNER+ADMIN)");
}

main()
  .catch((e) => {
    console.error("❌ Seed failed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
