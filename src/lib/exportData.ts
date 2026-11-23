import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { applyFilters, resource } from "./listQuery";
import { parseListQuery } from "./resources";

/** Fetch all rows matching list filters (paged internally, capped at 20,000). */
export async function fetchAll(db: SupabaseClient, name: string, sp: URLSearchParams) {
  const def = resource(name);
  const lq = parseListQuery(sp);
  const rows: Record<string, unknown>[] = [];
  const sort = lq.sort && def.sortable.includes(lq.sort) ? lq.sort : def.defaultSort;
  for (let from = 0; from < 20000; from += 1000) {
    let qb = db.from(def.view ?? def.table).select("*");
    qb = applyFilters(qb, def, lq);
    const dateCol = name === "follow_ups" ? "due_at" : name === "tenders" ? "publication_date" : "created_at";
    if (sp.get("from")) qb = qb.gte(dateCol, sp.get("from")!);
    if (sp.get("to")) qb = qb.lte(dateCol, `${sp.get("to")}T23:59:59`);
    const { data, error } = await qb.order(sort, { ascending: lq.dir === "asc" }).range(from, from + 999);
    if (error) throw error;
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) break;
  }
  return rows;
}

export async function companyBranding(db: SupabaseClient) {
  const { data } = await db.from("application_settings").select("value").eq("key", "company").maybeSingle();
  const v = (data?.value ?? {}) as { name?: string; website?: string };
  return { company: v.name ?? "KAYA INTERIORS PRIVATE LIMITED", website: v.website ?? "www.kayainteriors.in" };
}
