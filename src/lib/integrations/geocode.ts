import "server-only";
import { providerFetch, recordUsage } from "./registry";

export interface GeoResult { lat: number; lng: number; source: "nominatim"; formatted?: string; precision: "address" | "locality" | "city" }

let lastNominatim = 0;

export async function geocode(address: string, userId?: string): Promise<GeoResult | null> {
  // OSM Nominatim — respect 1 req/s usage policy.
  const wait = 1100 - (Date.now() - lastNominatim);
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const u = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=in&q=${encodeURIComponent(address)}`;
  const j = (await providerFetch("nominatim", u, { headers: { "User-Agent": `KayaProjectIntelligence360/1.0 (${process.env.NOMINATIM_CONTACT_EMAIL ?? "admin@kayainteriors.in"})` } })) as { lat: string; lon: string; display_name: string; addresstype?: string }[];
  await recordUsage({ provider: "nominatim", operation: "geocode", success: true, userId });
  if (!j[0]) return null;
  const t = j[0].addresstype ?? "";
  return { lat: Number(j[0].lat), lng: Number(j[0].lon), source: "nominatim", formatted: j[0].display_name, precision: ["city", "town", "state_district", "county"].includes(t) ? "city" : ["suburb", "neighbourhood", "quarter"].includes(t) ? "locality" : "address" };
}
