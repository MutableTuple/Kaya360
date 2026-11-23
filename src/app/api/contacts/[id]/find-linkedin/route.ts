import { route, must } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { webSearch } from "@/lib/integrations/search";
import { nameGrounded } from "@/lib/discovery/grounding";

/** Returns candidate public LinkedIn profile URLs from web search; the user confirms one (nothing is auto-saved). */
export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const c = must(await ctx.supabase.from("v_contacts").select("full_name,company_name,designation").eq("id", id).maybeSingle());
  const name = String(c.full_name).replace(/\[DEMO\]\s*/i, "");
  const { hits, providers } = await webSearch(`"${name}" ${c.company_name ? `"${c.company_name}"` : ""} site:linkedin.com/in`, { num: 10, userId: ctx.user.id, minResults: 1 });
  const candidates = hits.filter((h) => /linkedin\.com\/in\//i.test(h.url) && nameGrounded(`${h.title} ${h.snippet}`, name))
    .map((h) => ({ url: h.url.split("?")[0], title: h.title, snippet: h.snippet, mentionsCompany: c.company_name ? `${h.title} ${h.snippet}`.toLowerCase().includes(String(c.company_name).toLowerCase()) : false }));
  return { candidates, providers, message: candidates.length ? "Confirm the correct profile before saving." : "No matching public LinkedIn profile found in search results." };
}, { roles: WRITE_ROLES, limit: 30 });
