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
        throw new Error(`SMTP config missing. Check .env (SMTP_HOST/SMTP_USER/SMTP_PASS). Now host="${host}", user="${user}"`);
    }
}
function createTransporter() {
    const { host, port, user, pass } = getMailConfig();
    //Gmail:
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
export async function sendVerifyEmail(to, opts) {
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
export async function sendStaffInviteEmail(to, opts) {
    assertMailConfig();
    const { from } = getMailConfig();
    const transporter = createTransporter();
    await transporter.sendMail({
        from,
        to,
        subject: "เชิญเข้าใช้งาน RentSphere (เจ้าหน้าที่)",
        html: `
      <div style="font-family: Arial, sans-serif; line-height:1.6">
        <h2>คุณได้รับเชิญเป็นเจ้าหน้าที่</h2>

        <p>คุณถูกเชิญให้เข้าร่วมระบบจัดการคอนโด ${opts.condoName ?? ""} ใน RentSphere</p>

        <p>กดปุ่มด้านล่างเพื่อตั้งรหัสผ่านและเริ่มใช้งาน</p>

        <p style="margin:24px 0">
          <a href="${opts.inviteUrl}"
             style="
              background:#2563eb;
              color:white;
              padding:12px 18px;
              text-decoration:none;
              border-radius:8px;
              font-weight:600;
             ">
             ตั้งรหัสผ่าน
          </a>
        </p>

        <p style="color:#666">
          หากปุ่มไม่ทำงาน ให้คัดลอกลิงก์นี้ไปเปิดในเบราว์เซอร์
        </p>

        <p style="word-break:break-all;color:#333">
          ${opts.inviteUrl}
        </p>

        <p style="color:#999;font-size:12px">
          ลิงก์นี้มีอายุจำกัดเพื่อความปลอดภัย
        </p>
      </div>
    `,
    });
}
