import nodemailer from "nodemailer";

function getMailConfig() {
  const host = process.env.SMTP_HOST || "";
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || "";
  const pass = process.env.SMTP_PASS || "";
  const from = process.env.SMTP_FROM || user;

  return { host, port, user, pass, from };
}

function assertMailConfig() {
  const { host, user, pass } = getMailConfig();
  if (!host || !user || !pass) {
    throw new Error(
      `SMTP config missing. Check .env (SMTP_HOST/SMTP_USER/SMTP_PASS). Now host="${host}", user="${user}"`
    );
  }
}

function createTransporter() {
  const { host, port, user, pass } = getMailConfig();

  // Gmail:
  // - port 587 => secure=false (STARTTLS)
  // - port 465 => secure=true
  const secure = port === 465;

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export async function sendVerifyEmail(
  to: string,
  opts: { code: string; verifyUrl: string }
) {
  assertMailConfig();
  const { from } = getMailConfig();
  const transporter = createTransporter();

  await transporter.sendMail({
    from,
    to,
    subject: "RentSphere: ยืนยันอีเมลของคุณ",
    html: `
      <div style="font-family: Arial, sans-serif; line-height:1.5">
        <h2>ยืนยันอีเมล</h2>
        <p>รหัสยืนยันของคุณคือ:</p>
        <div style="font-size:44px;font-weight:800;letter-spacing:6px;margin:12px 0;">${opts.code}</div>
        <p>นำรหัสนี้ไปกรอกในหน้าเว็บเพื่อยืนยันอีเมล</p>
        <p style="color:#666">หรือกดลิงก์นี้เพื่อกลับไปที่หน้าใส่รหัส:</p>
        <p><a href="${opts.verifyUrl}">${opts.verifyUrl}</a></p>
        <p style="color:#666;font-size:12px">รหัสมีอายุจำกัด กรุณายืนยันภายในเวลาที่กำหนด</p>
      </div>
    `,
  });
}
