import { resolveGeography, type GeoSelection } from "../geo";

export interface DiscoveryParams {
  geography: GeoSelection;
  categories: string[];
  stages: string[];
  period: "7d" | "30d" | "90d" | "6m" | "12m" | "upcoming12m";
  sizes: string[];
  keywords: string[];
  customQuery?: string;
  maxQueries?: number;
  // decision-maker jobs
  companyId?: string; companyName?: string; companyDomain?: string; roleGroups?: string[]; projectId?: string;
}

const CATEGORY_TERMS: Record<string, string> = {
  "Corporate offices": "new corporate office", "Commercial office interiors": "office interior fit-out", "IT parks": "IT park",
  "Business parks": "business park", "Retail stores": "new retail store launch", Showrooms: "new showroom", "Shopping malls": "upcoming mall",
  Hospitals: "new hospital", Clinics: "new clinic", Hotels: "new hotel", Resorts: "new resort", Restaurants: "new restaurant outlet",
  "Cafés": "new café outlet", "Educational institutions": "new campus", Banks: "new bank branch office", "Financial institutions": "new office financial services",
  "Co-working spaces": "co-working centre", "Residential clubhouse interiors": "clubhouse interiors", "Government interiors": "government office interior works",
  "Industrial offices": "industrial office building", "Factory administration offices": "factory administrative building", "Renovation projects": "office renovation",
  "Commercial refurbishment": "commercial refurbishment",
};

const STAGE_TERMS: Record<string, string> = {
  announced: "announces", planning: "plans", design: "design", tendering: "tender", construction: "under construction",
  interior_fit_out: "fit-out", renovation: "renovation", vendor_appointment_pending: "contractor",
};

/** Deterministic, transparent query generation (shown to the user in the progress panel). */
export function buildProjectQueries(p: DiscoveryParams): string[] {
  const { places } = resolveGeography(p.geography);
  const cats = p.categories.length ? p.categories : ["Corporate offices", "Commercial office interiors"];
  const kws = p.keywords.length ? p.keywords : [];
  const stageWord = p.stages.map((s) => STAGE_TERMS[s]).filter(Boolean)[0];
  const yr = new Date().getFullYear();
  const yearHint = p.period === "upcoming12m" ? `${yr} ${yr + 1}` : String(yr);
  const out: string[] = [];
  if (p.customQuery?.trim()) out.push(p.customQuery.trim());
  const placeList = places.length ? places : ["India"];
  for (const place of placeList) {
    for (const c of cats) {
      out.push([CATEGORY_TERMS[c] ?? c, place, stageWord, yearHint].filter(Boolean).join(" "));
      if (out.length > 400) break;
    }
    for (const k of kws) out.push(`"${k}" ${place}`);
  }
  // Generic high-intent queries
  for (const place of placeList.slice(0, 4)) {
    out.push(`"interior contractor" required ${place}`);
    out.push(`office leased sq ft ${place} ${yearHint}`);
  }
  const uniq = [...new Set(out.map((q) => q.replace(/\s+/g, " ").trim()))];
  return interleave(uniq, placeList).slice(0, Math.max(1, Math.min(p.maxQueries ?? 24, 100)));
}

/** Spread queries across places so a capped job still covers every selected location. */
function interleave(qs: string[], places: string[]) {
  const buckets = places.map((pl) => qs.filter((q) => q.includes(pl)));
  const rest = qs.filter((q) => !places.some((pl) => q.includes(pl)));
  const out: string[] = [...rest];
  for (let i = 0; buckets.some((b) => b[i]); i++) for (const b of buckets) if (b[i]) out.push(b[i]);
  return [...new Set(out)];
}

const TENDER_PORTALS = [
  "eprocure.gov.in", "gem.gov.in", "mahatenders.gov.in", "nprocure.com", "govtprocurement.delhi.gov.in",
  "etenders.hry.nic.in", "etender.up.nic.in", "eproc.rajasthan.gov.in", "eproc.punjab.gov.in", "eprocure.goa.gov.in",
];

export function buildTenderQueries(p: DiscoveryParams): string[] {
  const { places } = resolveGeography(p.geography);
  const cats = p.categories.length ? p.categories : ["Interior works", "Commercial fit-out", "Furniture and joinery"];
  const out: string[] = [];
  if (p.customQuery?.trim()) out.push(p.customQuery.trim());
  for (const c of cats) {
    out.push(`tender "${c.toLowerCase()}" ${places.slice(0, 3).join(" OR ")}`);
    for (const portal of TENDER_PORTALS.slice(0, 4)) out.push(`site:${portal} ${c.toLowerCase()}`);
  }
  for (const place of places.slice(0, 6)) {
    out.push(`interior works tender ${place}`);
    out.push(`"request for quotation" interior ${place}`);
    out.push(`"expression of interest" interior contractor empanelment ${place}`);
  }
  for (const k of p.keywords) out.push(`tender "${k}"`);
  return [...new Set(out)].slice(0, Math.max(1, Math.min(p.maxQueries ?? 24, 100)));
}

export function buildDecisionMakerQueries(p: DiscoveryParams, titles: string[]): string[] {
  const co = p.companyName?.trim();
  if (!co) return [];
  const out: string[] = [];
  for (const t of titles.slice(0, 10)) out.push(`"${co}" "${t}" site:linkedin.com/in`);
  out.push(`"${co}" leadership team`, `"${co}" "head of projects" OR "procurement head" OR "facilities head"`);
  if (p.companyDomain) out.push(`site:${p.companyDomain} team OR leadership OR management OR contact`);
  return [...new Set(out)].slice(0, Math.min(p.maxQueries ?? 14, 30));
}
