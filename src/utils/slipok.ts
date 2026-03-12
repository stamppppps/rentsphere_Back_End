/**
 * SlipOK – shared slip verification utility
 * ใช้ร่วมกันทั้ง LINE webhook และ Web API
 */
export async function verifySlipWithSlipOK(imageBuffer: Buffer): Promise<{
  success: boolean;
  data?: any;
  error?: string;
}> {
  const apiKey = process.env.SLIPOK_API_KEY;
  const branchId = process.env.SLIPOK_BRANCH_ID;

  if (!apiKey || !branchId) {
    return { success: false, error: "SlipOK ไม่ได้ตั้งค่า" };
  }

  try {
    const formData = new FormData();
    const blob = new Blob([new Uint8Array(imageBuffer)], { type: "image/jpeg" });
    formData.append("files", blob, "slip.jpg");

    const res = await fetch(`https://api.slipok.com/api/line/apikey/${branchId}`, {
      method: "POST",
      headers: {
        "x-authorization": apiKey,
      },
      body: formData,
    });

    const json = await res.json();
    console.log("SlipOK FULL response:", JSON.stringify(json, null, 2));

    // Extract data from various response shapes
    const d = json?.data?.data || json?.data || json;

    // Check if there is any transaction data at all — if yes, the slip is valid
    const hasTransactionData = d && (
      d.transRef || d.amount || d.transAmount ||
      d.sender?.name || d.receiver?.name ||
      d.sendingBank || d.receivingBank
    );

    if (hasTransactionData) {
      console.log("SlipOK: slip has valid transaction data — accepting");
      return { success: true, data: d };
    }

    // Fallback: check explicit success flags
    if (json?.data?.success || json?.success) {
      return { success: true, data: json.data || json };
    }

    const errMsg = json?.data?.message || json?.message || "ตรวจ slip ไม่สำเร็จ";
    console.log("SlipOK: no transaction data found, error:", errMsg);
    return { success: false, data: json, error: errMsg };
  } catch (err: any) {
    console.error("SlipOK error:", err);
    return { success: false, error: err?.message || "SlipOK error" };
  }
}
