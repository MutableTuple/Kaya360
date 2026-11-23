import { route } from "@/lib/api";
import { escapeLike } from "@/lib/resources";

export const GET = route(async (req, ctx) => {
  const q = escapeLike((req.nextUrl.searchParams.get("q") ?? "").trim()).slice(0, 80);
  if (q.length < 2) return { results: [] };
  const like = `%${q}%`;
  const db = ctx.supabase;
  const [leads, projects, companies, contacts, tenders] = await Promise.all([
    db.from("v_leads").select("id,lead_code,project_name,company_name,city").is("deleted_at", null).or(`lead_code.ilike.${like},project_name.ilike.${like},company_name.ilike.${like}`).limit(6),
    db.from("v_projects").select("id,project_code,name,client_name,city").is("deleted_at", null).or(`name.ilike.${like},project_code.ilike.${like},client_name.ilike.${like}`).limit(6),
    db.from("companies").select("id,name,city,company_type").is("deleted_at", null).ilike("name", like).limit(6),
    db.from("v_contacts").select("id,full_name,designation,company_name").is("deleted_at", null).or(`full_name.ilike.${like},direct_email.ilike.${like},designation.ilike.${like}`).limit(6),
    db.from("tenders").select("id,title,organisation,reference_number").is("deleted_at", null).or(`title.ilike.${like},organisation.ilike.${like},reference_number.ilike.${like}`).limit(6),
  ]);
  const results = [
    ...(leads.data ?? []).map((r) => ({ type: "Lead", title: r.project_name ?? r.lead_code, sub: [r.lead_code, r.company_name, r.city].filter(Boolean).join(" · "), href: `/leads/${r.id}` })),
    ...(projects.data ?? []).map((r) => ({ type: "Project", title: r.name, sub: [r.project_code, r.client_name, r.city].filter(Boolean).join(" · "), href: `/projects/${r.id}` })),
    ...(companies.data ?? []).map((r) => ({ type: "Company", title: r.name, sub: [r.company_type?.replace(/_/g, " "), r.city].filter(Boolean).join(" · "), href: `/companies/${r.id}` })),
    ...(contacts.data ?? []).map((r) => ({ type: "Contact", title: r.full_name, sub: [r.designation, r.company_name].filter(Boolean).join(" · "), href: `/contacts?open=${r.id}` })),
    ...(tenders.data ?? []).map((r) => ({ type: "Tender", title: r.title, sub: [r.organisation, r.reference_number].filter(Boolean).join(" · "), href: `/tenders?open=${r.id}` })),
  ];
  return { results };
});
