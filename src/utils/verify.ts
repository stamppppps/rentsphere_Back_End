import crypto from "crypto";

export function randomOtp6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

export function sha256(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export function randomToken() {
  return crypto.randomBytes(32).toString("hex");
}
