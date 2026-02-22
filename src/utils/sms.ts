import twilio from "twilio";

// Production: ใช้ Twilio (หรือ provider อื่น)
// - ถ้ายังไม่ set ENV จะ fallback เป็น "dev mode" แล้ว log OTP อย่างเดียว

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM; // เช่น +1xxx หรือ Messaging Service SID

export async function sendVerifySms(to: string, code: string) {
  // กันพังแบบเงียบ ๆ: ถ้าไม่มี env ถือว่า dev mode
  if (!sid || !token || !from) {
    console.log("📲 SMS (dev) =>", code, "to", to);
    return;
  }

  const client = twilio(sid, token);
  await client.messages.create({
    from,
    to,
    body: `RentSphere OTP: ${code} (หมดอายุใน 10 นาที)`,
  });
}
