import { describe, it, expect } from "vitest";
import { normalizeText, normalizeDomain, projectDedupeKey, similarity } from "@/lib/normalize";
import { buildProjectQueries, buildTenderQueries, buildDecisionMakerQueries } from "@/lib/discovery/queries";
import { renderTemplate, unfilled } from "@/lib/templates";
import { mapHunter } from "@/lib/integrations/verify";
import { parseRobots, htmlToText } from "@/lib/fetchPage";
import { rateLimit } from "@/lib/ratelimit";
import { roleGroupFor } from "@/lib/roleGroups";
import { resolveGeography, isPriorityRegion, cityCoords } from "@/lib/geo";
import { canonicalUrl } from "@/lib/integrations/search";
import { buildMime } from "@/lib/integrations/gmail";

describe("normalisation & duplicates", () => {
  it("matches the SQL normaliser behaviour", () => {
    expect(normalizeText("Acme Realty Pvt. Ltd.")).toBe(normalizeText("ACME REALTY PRIVATE LIMITED"));
    expect(normalizeText("Air India")).toBe("airindia");
    expect(normalizeDomain("https://www.acme.in/about?x=1")).toBe("acme.in");
    expect(projectDedupeKey("Acme Tower — Corporate Office", "Mumbai")).toBe(projectDedupeKey("ACME Tower Corporate Office", "mumbai"));
    expect(similarity("Horizon Tower B office Pune", "Horizon Tower B Pune")).toBeGreaterThan(0.9);
  });
  it("canonicalises URLs for duplicate detection", () => {
    expect(canonicalUrl("https://www.x.com/a/?utm_source=t#h")).toBe(canonicalUrl("http://x.com/a"));
  });
});

describe("query generation", () => {
  it("covers every selected city when capped", () => {
    const q = buildProjectQueries({ geography: { scope: "cities", cities: ["Mumbai", "Pune", "Gurugram"] }, categories: ["Corporate offices", "Hospitals"], stages: [], period: "30d", sizes: [], keywords: [], maxQueries: 3 });
    expect(q).toHaveLength(3);
    for (const c of ["Mumbai", "Pune", "Gurugram"]) expect(q.some((x) => x.includes(c))).toBe(true);
  });
  it("includes custom query and keywords", () => {
    const q = buildProjectQueries({ geography: { scope: "cities", cities: ["Thane"] }, categories: [], stages: [], period: "7d", sizes: [], keywords: ["office relocation"], customQuery: "BKC lease", maxQueries: 50 });
    expect(q[0]).toBe("BKC lease"); expect(q.some((x) => x.includes('"office relocation" Thane'))).toBe(true);
  });
  it("tender queries target procurement portals", () => {
    expect(buildTenderQueries({ geography: { scope: "west" }, categories: ["Interior works"], stages: [], period: "30d", sizes: [], keywords: [], maxQueries: 40 }).some((q) => q.includes("site:eprocure.gov.in"))).toBe(true);
  });
  it("decision maker queries need a company", () => {
    expect(buildDecisionMakerQueries({ geography: { scope: "all" }, categories: [], stages: [], period: "12m", sizes: [], keywords: [] }, ["Facilities Head"])).toEqual([]);
  });
  it("geography", () => {
    expect(resolveGeography({ scope: "north" }).places).toContain("Gurugram");
    expect(isPriorityRegion(null, "Thane")).toBe(true); expect(isPriorityRegion("Karnataka", null)).toBe(false);
    expect(cityCoords("gurugram")).toBeDefined();
  });
});

describe("templates", () => {
  it("reports missing placeholders", () => {
    const r = renderTemplate("Dear {{contact_name}}, re {{project_name}}", { contact_name: "Asha", project_name: null });
    expect(r.text).toBe("Dear Asha, re {{project_name}}"); expect(r.missing).toEqual(["project_name"]);
    expect(unfilled(r.text)).toEqual(["project_name"]);
  });
});

describe("verification mapping (format alone never verifies)", () => {
  it("hunter", () => { expect(mapHunter({ status: "valid" })).toBe("verified"); expect(mapHunter({ status: "accept_all" })).toBe("catch_all"); expect(mapHunter({ status: "unknown" })).toBe("unknown"); expect(mapHunter({ status: "disposable" })).toBe("invalid"); });
});

describe("fetching helpers", () => {
  it("parses robots.txt for *", () => { expect(parseRobots("User-agent: *\nDisallow: /private\nUser-agent: bot\nDisallow: /")).toEqual(["/private"]); });
  it("extracts readable text", () => {
    const r = htmlToText("<html><head><title>News &amp; more</title><script>x()</script></head><body><nav>menu</nav><p>Acme&nbsp;leases 50,000 sq ft</p></body></html>");
    expect(r.title).toBe("News & more"); expect(r.text).toContain("Acme leases 50,000 sq ft"); expect(r.text).not.toContain("menu"); expect(r.text).not.toContain("x()");
  });
});

describe("rate limit, roles, MIME", () => {
  it("limits per key", () => { const t = 1_000_000; for (let i = 0; i < 3; i++) expect(rateLimit("k", 3, t + i).ok).toBe(true); expect(rateLimit("k", 3, t + 5).ok).toBe(false); expect(rateLimit("k", 3, t + 61_000).ok).toBe(true); });
  it("maps designations", () => { expect(roleGroupFor("Head of Procurement")).toBe("procurement"); expect(roleGroupFor("Facility Manager")).toBe("corporate_facilities"); expect(roleGroupFor("Principal Architect")).toBe("design"); expect(roleGroupFor("Senior Project Manager")).toBe("project_management"); });
  it("builds RFC822 and blocks header injection", () => {
    const raw = buildMime({ from: "a@kaya.in", to: "b@x.in", subject: "Hello ₹", body: "Hi" });
    const dec = Buffer.from(raw, "base64url").toString();
    expect(dec).toContain("To: b@x.in"); expect(dec).toContain("=?UTF-8?B?");
    expect(() => buildMime({ from: "a@kaya.in", to: "b@x.in\r\nBcc: evil@x.com", subject: "s", body: "b" })).toThrow();
  });
});

import { extractEmails, extractPhones } from "@/lib/contactFinder";
describe("contact finder", () => {
  it("pulls emails, own domain first, skips junk", () => {
    const html = `<a href="mailto:info%40acme.in">Mail</a> sales@gmail.com logo@2x.png noreply@acme.in hr [at] acme.in`;
    const e = extractEmails(html, "acme.in");
    expect(e[0].endsWith("acme.in")).toBe(true);
    expect(e).toContain("info@acme.in");
    expect(e).not.toContain("noreply@acme.in");
    expect(e.some((x) => x.endsWith(".png"))).toBe(false);
  });
  it("pulls Indian phone numbers", () => {
    const p = extractPhones(`<a href="tel:+919876543210">Call</a> Office: 022-2659 1234, Toll free 1800 123 4567, GST 27AABCU9603R1ZM`);
    expect(p).toContain("+91 98765 43210");
    expect(p).toContain("+91 2226591234");
    expect(p).toContain("18001234567");
  });
});
