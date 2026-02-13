import nodemailer from "nodemailer";

const host = process.env.SMTP_HOST!;
const port = Number(process.env.SMTP_PORT || 587);
const user = process.env.SMTP_USER!;
const pass = process.env.SMTP_PASS!;
const from = process.env.SMTP_FROM || user;

export const transporter = nodemailer.createTransport({
  host,
  port,
  secure: false, // 587 = STARTTLS
  auth: { user, pass },
});

export async function sendVerifyEmail(to: string, verifyLink: string) {
  await transporter.sendMail({
    from,
    to,
    subject: "RentSphere: ยืนยันอีเมลของคุณ",
    html: `
      <div style="font-family: Arial;">
        <h2>ยืนยันอีเมล</h2>
        <p>กดปุ่มด้านล่างเพื่อยืนยันอีเมล</p>
        <p><a href="${verifyLink}" style="padding:10px 16px;background:#2563eb;color:#fff;border-radius:8px;text-decoration:none;">ยืนยันอีเมล</a></p>
        <p style="color:#666">ถ้าปุ่มกดไม่ได้ ให้คัดลอกลิงก์นี้:</p>
        <p>${verifyLink}</p>
      </div>
    `,
  });
}
