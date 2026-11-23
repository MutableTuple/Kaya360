import "server-only";
import { lookup } from "dns/promises";
import { isIP } from "net";

export interface FetchedPage { url: string; finalUrl: string; title: string; text: string; publishedAt?: string; skipped?: string }

const UA = "Mozilla/5.0 (compatible; KayaProjectIntelligence360/1.0; +https://www.kayainteriors.in)";
// Sites whose terms or authentication walls forbid automated fetching: only the
// search engine's public snippet is used for these.
const SNIPPET_ONLY = [/(^|\.)linkedin\.com$/i, /(^|\.)facebook\.com$/i, /(^|\.)instagram\.com$/i, /(^|\.)x\.com$/i, /(^|\.)twitter\.com$/i, /(^|\.)zoominfo\.com$/i, /(^|\.)rocketreach\.co$/i];

export function snippetOnly(url: string) {
  try { const h = new URL(url).hostname; return SNIPPET_ONLY.some((r) => r.test(h)); } catch { return true; }
}

function privateIp(ip: string) {
  if (ip.includes(":")) return ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:127.") || ip === "::";
  const [a, b] = ip.split(".").map(Number);
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
}

async function assertPublic(u: URL) {
  if (!/^https?:$/.test(u.protocol)) throw new Error("Only http(s) URLs are fetched");
  if (/^(localhost|.*\.local|.*\.internal)$/i.test(u.hostname)) throw new Error("Private host");
  const ips = isIP(u.hostname) ? [u.hostname] : (await lookup(u.hostname, { all: true })).map((x) => x.address);
  if (ips.some(privateIp)) throw new Error("Private network address blocked");
}

const robotsCache = new Map<string, { rules: string[]; at: number }>();
export function parseRobots(txt: string): string[] {
  const rules: string[] = []; let applies = false; let sawAgent = false;
  for (const raw of txt.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); if (!line) continue;
    const [k, ...rest] = line.split(":"); const v = rest.join(":").trim(); const key = k.toLowerCase();
    if (key === "user-agent") { if (sawAgent && !applies) { /* new group */ } applies = v === "*" || /kaya/i.test(v); sawAgent = true; }
    else if (key === "disallow" && applies && v) rules.push(v);
  }
  return rules;
}
async function robotsAllowed(u: URL) {
  const origin = u.origin;
  let c = robotsCache.get(origin);
  if (!c || Date.now() - c.at > 3600_000) {
    let rules: string[] = [];
    try {
      const r = await fetch(`${origin}/robots.txt`, { headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000), redirect: "follow" });
      if (r.ok) rules = parseRobots((await r.text()).slice(0, 200_000));
    } catch { /* no robots → allowed */ }
    c = { rules, at: Date.now() }; robotsCache.set(origin, c);
  }
  return !c.rules.some((p) => (u.pathname + u.search).startsWith(p.replace(/\*.*$/, "")));
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", ndash: "–", mdash: "—", hellip: "…", rupee: "₹" };
export function htmlToText(html: string) {
  const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim();
  const published = html.match(/<meta[^>]+(?:property|name)=["'](?:article:published_time|og:published_time|date|pubdate|publish-date)["'][^>]+content=["']([^"']+)["']/i)?.[1];
  let t = html
    .replace(/<(script|style|noscript|svg|iframe|nav|footer|form)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/(p|div|h[1-6]|li|tr|br|section|article)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
  t = t.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l.length > 1).join("\n");
  return { title: htmlToTextTitle(title), text: t, publishedAt: published };
}
function htmlToTextTitle(t: string) { return t.replace(/\s+/g, " ").replace(/&amp;/g, "&").trim(); }

export async function fetchPage(url: string, maxChars = 14_000): Promise<FetchedPage> {
  const u = new URL(url);
  if (snippetOnly(url)) return { url, finalUrl: url, title: "", text: "", skipped: "snippet_only_site" };
  await assertPublic(u);
  if (!(await robotsAllowed(u))) return { url, finalUrl: url, title: "", text: "", skipped: "robots_disallowed" };
  const res = await fetch(u, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,text/plain" }, redirect: "follow", signal: AbortSignal.timeout(15_000) });
  const finalUrl = res.url || url;
  await assertPublic(new URL(finalUrl));
  if (!res.ok) return { url, finalUrl, title: "", text: "", skipped: `http_${res.status}` };
  const ct = res.headers.get("content-type") ?? "";
  if (!/text\/html|text\/plain|xhtml/i.test(ct)) return { url, finalUrl, title: "", text: "", skipped: `unsupported_${ct.split(";")[0] || "type"}` };
  const reader = res.body?.getReader(); let html = ""; let size = 0; const dec = new TextDecoder();
  if (reader) {
    while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; html += dec.decode(value, { stream: true }); if (size > 1_500_000) { await reader.cancel(); break; } }
  }
  const { title, text, publishedAt } = ct.includes("text/plain") ? { title: "", text: html, publishedAt: undefined } : htmlToText(html);
  return { url, finalUrl, title, text: text.slice(0, maxChars), publishedAt };
}
