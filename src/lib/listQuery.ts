import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { HttpError } from "./api";
import { RESOURCES, escapeLike, statesForRegions, type ListQuery, type ResourceDef } from "./resources";

export function resource(name: string): ResourceDef {
  const r = RESOURCES[name];
  if (!r) throw new HttpError(404, `Unknown resource “${name}”.`);
  return r;
}

export function applyFilters(qb: any, def: ResourceDef, lq: ListQuery) {
  if (def.softDelete && !lq.includeDeleted) qb = qb.is("deleted_at", null);
  if (def.table === "leads" && !lq.filters.archived) qb = qb.is("archived_at", null);
  for (const [k, raw] of Object.entries(lq.filters)) {
    const f = def.filters[k];
    if (!f) continue;
    const list = raw.split("|").map((s) => s.trim()).filter(Boolean);
    switch (f.op) {
      case "eq": qb = qb.eq(f.col, raw); break;
      case "in": qb = list.length > 1 ? qb.in(f.col, list) : qb.eq(f.col, list[0]); break;
      case "gte": qb = qb.gte(f.col, raw); break;
      case "lte": qb = qb.lte(f.col, raw); break;
      case "ilike": qb = qb.ilike(f.col, `%${escapeLike(raw)}%`); break;
      case "isnull": qb = qb.is(f.col, null); break;
      case "notnull": qb = qb.not(f.col, "is", null); break;
      case "bool": qb = qb.eq(f.col, raw === "true" || raw === "1"); break;
      case "isfalse": qb = qb.eq(f.col, false); break;
      case "region": qb = qb.in(f.col, statesForRegions(list)); break;
    }
  }
  if (lq.q?.trim()) {
    const term = escapeLike(lq.q.trim()).slice(0, 100);
    qb = qb.or(def.search.map((c) => `${c}.ilike.%${term}%`).join(","));
  }
  return qb;
}

export async function listResource(db: SupabaseClient, name: string, lq: ListQuery, select = "*") {
  const def = resource(name);
  let qb = db.from(def.view ?? def.table).select(select, { count: "exact" });
  qb = applyFilters(qb, def, lq);
  const sort = lq.sort && def.sortable.includes(lq.sort) ? lq.sort : def.defaultSort;
  const asc = lq.dir ? lq.dir === "asc" : ["name", "full_name", "due_at", "submission_deadline", "role", "scope"].includes(sort);
  qb = qb.order(sort, { ascending: asc, nullsFirst: false });
  if (sort !== "created_at" && def.sortable.includes("created_at")) qb = qb.order("created_at", { ascending: false });
  const from = ((lq.page ?? 1) - 1) * (lq.pageSize ?? 25);
  qb = qb.range(from, from + (lq.pageSize ?? 25) - 1);
  const { data, count, error } = await qb;
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0, page: lq.page ?? 1, pageSize: lq.pageSize ?? 25, sort, dir: asc ? "asc" : "desc" };
}
