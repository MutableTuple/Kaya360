import "server-only";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { HttpError } from "../api";
import { env, ConfigError } from "../env";
import { decrypt, encrypt } from "../crypto";
import { providerFetch, recordUsage, requireCredentials } from "./registry";

const TRACK = process.env.GMAIL_TRACK_REPLIES === "true";
export const GMAIL_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/gmail.send", ...(TRACK ? ["https://www.googleapis.com/auth/gmail.metadata"] : [])];
const redirectUri = () => `${env.appUrl()}/api/email/oauth/callback`;

function sign(v: string) {
  const k = env.encryptionKey();
  if (!k) throw new ConfigError("APP_ENCRYPTION_KEY is required for Gmail OAuth.");
  return createHmac("sha256", k).update(v).digest("base64url");
}
export function makeState(userId: string) {
  const v = `${userId}.${Date.now()}.${randomBytes(8).toString("hex")}`;
  return `${v}.${sign(v)}`;
}
export function readState(state: string): string {
  const parts = state.split(".");
  const sig = parts.pop()!; const v = parts.join(".");
  const a = Buffer.from(sig); const b = Buffer.from(sign(v));
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpError(400, "Invalid OAuth state.");
  if (Date.now() - Number(parts[1]) > 15 * 60_000) throw new HttpError(400, "OAuth request expired. Please try connecting again.");
  return parts[0];
}

export async function gmailAuthUrl(userId: string) {
  const c = await requireCredentials("gmail");
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", c.client_id); u.searchParams.set("redirect_uri", redirectUri());
  u.searchParams.set("response_type", "code"); u.searchParams.set("scope", GMAIL_SCOPES.join(" "));
  u.searchParams.set("access_type", "offline"); u.searchParams.set("prompt", "consent"); u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", makeState(userId));
  return u.toString();
}

export async function exchangeCode(code: string) {
  const c = await requireCredentials("gmail");
  const tok = (await providerFetch("gmail", "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: c.client_id, client_secret: c.client_secret, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  })) as { access_token: string; refresh_token?: string; scope: string };
  if (!tok.refresh_token) throw new HttpError(400, "Google did not return a refresh token. Remove the app from your Google account permissions and connect again.");
  const info = (await providerFetch("gmail", "https://openidconnect.googleapis.com/v1/userinfo", { headers: { Authorization: `Bearer ${tok.access_token}` } })) as { email: string };
  return { email: info.email, encryptedRefresh: encrypt(tok.refresh_token), scopes: tok.scope };
}

async function accessToken(encryptedRefresh: string) {
  const c = await requireCredentials("gmail");
  const tok = (await providerFetch("gmail", "https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: decrypt(encryptedRefresh), client_id: c.client_id, client_secret: c.client_secret, grant_type: "refresh_token" }),
  })) as { access_token: string };
  return tok.access_token;
}

function encodeHeader(v: string) { return /[^\x20-\x7e]/.test(v) ? `=?UTF-8?B?${Buffer.from(v).toString("base64")}?=` : v; }

export function buildMime(o: { from: string; to: string; cc?: string | null; subject: string; body: string }) {
  for (const v of [o.to, o.cc ?? "", o.subject]) if (/[\r\n]/.test(v)) throw new HttpError(400, "Header fields must not contain line breaks.");
  const lines = [
    `From: ${o.from}`, `To: ${o.to}`, ...(o.cc ? [`Cc: ${o.cc}`] : []), `Subject: ${encodeHeader(o.subject)}`,
    "MIME-Version: 1.0", 'Content-Type: text/plain; charset="UTF-8"', "Content-Transfer-Encoding: base64", "",
    Buffer.from(o.body).toString("base64").replace(/(.{76})/g, "$1\r\n"),
  ];
  return Buffer.from(lines.join("\r\n")).toString("base64url");
}

export async function gmailSend(account: { email: string; encrypted_refresh_token: string }, msg: { to: string; cc?: string | null; subject: string; body: string }, userId?: string) {
  try {
    const at = await accessToken(account.encrypted_refresh_token);
    const r = (await providerFetch("gmail", "https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
      method: "POST", headers: { Authorization: `Bearer ${at}`, "Content-Type": "application/json" },
      body: JSON.stringify({ raw: buildMime({ from: account.email, ...msg }) }),
    })) as { id: string; threadId: string };
    await recordUsage({ provider: "gmail", operation: "send", success: true, userId });
    return r;
  } catch (e) {
    await recordUsage({ provider: "gmail", operation: "send", success: false, error: (e as Error).message, userId });
    throw e;
  }
}

/** Returns true if the thread has a message not sent by us (requires GMAIL_TRACK_REPLIES=true). */
export async function gmailThreadHasReply(account: { email: string; encrypted_refresh_token: string }, threadId: string) {
  if (!TRACK) return null;
  const at = await accessToken(account.encrypted_refresh_token);
  const t = (await providerFetch("gmail", `https://gmail.googleapis.com/gmail/v1/users/me/threads/${threadId}?format=metadata&metadataHeaders=From`, { headers: { Authorization: `Bearer ${at}` } })) as
    { messages?: { payload?: { headers?: { name: string; value: string }[] } }[] };
  return (t.messages ?? []).some((m) => !(m.payload?.headers?.find((h) => h.name === "From")?.value ?? "").toLowerCase().includes(account.email.toLowerCase()));
}
