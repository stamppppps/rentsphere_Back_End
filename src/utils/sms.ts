import twilio from "twilio";

const sid = process.env.TWILIO_ACCOUNT_SID;
const token = process.env.TWILIO_AUTH_TOKEN;
const from = process.env.TWILIO_FROM; 

export async function sendVerifySms(to: string, code: string) {

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
