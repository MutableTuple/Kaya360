import "server-only";
import { createHmac, timingSafeEqual } from "crypto";
import { ConfigError } from "./env";

function key() { const k = process.env.APP_ENCRYPTION_KEY; if (!k) throw new ConfigError("APP_ENCRYPTION_KEY is required for calendar feeds."); return k; }
export function calendarToken(userId: string) { return `${userId}.${createHmac("sha256", key()).update(`cal:${userId}`).digest("base64url").slice(0, 32)}`; }
export function readCalendarToken(token: string) {
  const [uid, sig] = token.replace(/\.ics$/, "").split(".");
  if (!uid || !sig) return null;
  const exp = calendarToken(uid).split(".")[1];
  return exp.length === sig.length && timingSafeEqual(Buffer.from(exp), Buffer.from(sig)) ? uid : null;
}
