import "server-only";
import { createCipheriv, createDecipheriv, randomBytes, createHash } from "crypto";
import { env, ConfigError } from "./env";

function key(): Buffer {
  const k = env.encryptionKey();
  if (!k || k.length < 32) throw new ConfigError("APP_ENCRYPTION_KEY (min 32 chars) is required to store secrets/tokens in the database.");
  return createHash("sha256").update(k).digest();
}
/** AES-256-GCM. Output: base64(iv).base64(tag).base64(ciphertext) */
export function encrypt(plain: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv.toString("base64"), c.getAuthTag().toString("base64"), enc.toString("base64")].join(".");
}
export function decrypt(payload: string): string {
  const [iv, tag, data] = payload.split(".");
  const d = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  d.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([d.update(Buffer.from(data, "base64")), d.final()]).toString("utf8");
}
