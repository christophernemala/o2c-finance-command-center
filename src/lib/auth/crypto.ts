import { createHash, createCipheriv, createDecipheriv, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { compare } from "bcryptjs";
import * as OTPAuth from "otpauth";
const cost = { N: 65536, r: 8, p: 1, maxmem: 128 * 1024 * 1024 };
const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => scrypt(password, salt, 64, cost, (error, key) => error ? reject(error) : resolve(key)));
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");
export const newToken = () => randomBytes(32).toString("base64url");
export function validToken(token: unknown): token is string { return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token); }
export async function hashPassword(password: string): Promise<string> {
  if (password.length < 12 || password.length > 256) throw new Error("Invalid password");
  const salt = randomBytes(16); const key = await derive(password, salt);
  return `scrypt$65536$8$1$${salt.toString("hex")}$${key.toString("hex")}`;
}
// A fixed salt is used only for timing equalization when no account exists.
const dummy = `scrypt$65536$8$1$${"00".repeat(16)}$${"00".repeat(64)}`;
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  if (password.length < 1 || password.length > 256) return false;
  if (encoded && /^\$2[aby]\$(0[4-9]|1[0-4])\$[./A-Za-z0-9]{53}$/.test(encoded)) return compare(password, encoded.replace(/^\$2y\$/, "$2b$"));
  const value = encoded ?? dummy;
  const match = /^scrypt\$65536\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(value);
  const salt = Buffer.from(match?.[1] ?? "00".repeat(16), "hex");
  const actual = await derive(password, salt);
  return !!encoded && !!match && timingSafeEqual(actual, Buffer.from(match[2], "hex"));
}
export function encryptionKey(env: Record<string, string | undefined> = process.env): Buffer | null {
  const raw = env.MFA_ENCRYPTION_KEY;
  if (!raw || !/^[A-Za-z0-9+/]{43}=$/.test(raw)) return null;
  const key = Buffer.from(raw, "base64"); return key.length === 32 && key.toString("base64") === raw ? key : null;
}
export function encryptSecret(secret: string, key: Buffer, userId: string): string {
  const nonce = randomBytes(12); const cipher = createCipheriv("aes-256-gcm", key, nonce); cipher.setAAD(Buffer.from(userId));
  const bytes = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return `${nonce.toString("base64url")}.${cipher.getAuthTag().toString("base64url")}.${bytes.toString("base64url")}`;
}
export function decryptSecret(value: string, key: Buffer, userId: string): string {
  const [nonce, tag, bytes, extra] = value.split(".");
  if (!nonce || !tag || !bytes || extra) throw new Error("Invalid factor");
  const cipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "base64url"));
  cipher.setAAD(Buffer.from(userId)); cipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([cipher.update(Buffer.from(bytes, "base64url")), cipher.final()]).toString("utf8");
}
export function totp(secret: string, email: string) {
  return new OTPAuth.TOTP({ issuer: "O2C Finance", label: email, algorithm: "SHA1", digits: 6, period: 30, secret: OTPAuth.Secret.fromBase32(secret) });
}
export function generateFactor(email: string) {
  const secret = new OTPAuth.Secret({ size: 20 }).base32;
  return { secret, uri: totp(secret, email).toString() };
}
export function verifiedCounter(secret: string, code: string, previous: bigint, timestamp = Date.now()): bigint | null {
  if (!/^\d{6}$/.test(code)) return null;
  const delta = totp(secret, "").validate({ token: code, timestamp, window: 1 });
  if (delta === null) return null;
  const counter = BigInt(Math.floor(timestamp / 30000) + delta);
  return counter > previous ? counter : null;
}
