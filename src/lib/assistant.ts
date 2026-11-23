import "server-only";
import type { Ctx } from "./api";
import { chat, type ChatMessage, type ToolDef } from "./integrations/openai";
import { renderTemplate } from "./templates";
import { escapeLike, statesForRegions } from "./resources";

const SYSTEM = `You are the business development assistant inside KAYA PROJECT INTELLIGENCE 360 for KAYA INTERIORS PRIVATE LIMITED (interior contracting: turnkey interiors, commercial fit-outs, civil finishing, furniture manufacturing & installation, carpentry, flooring, ceilings, partitions, painting, electrical). Priority markets: West India (Maharashtra, Gujarat, Goa) and North India (Delhi NCR, Haryana, UP, Rajasthan, Punjab/Chandigarh).

HARD RULES:
- You have NO direct internet access. Answer only from the tool results (the company's own database).
- If the user asks to find NEW projects, tenders, PMCs or people on the web, call propose_research. This only PROPOSES a research job; the user must click to start it. Never say you searched the web, and never invent projects, companies, people, emails, phone numbers, tender references or deadlines.
- When the database has no matching records, say so plainly and offer to propose a research job.
- Report counts exactly as returned by tools. Mention record codes (e.g. LD-…) so the user can open them.
- For email drafts, call create_email_draft; it saves a DRAFT that the user must review and approve before anything is sent.
- Be concise and use short bullet lists. Currency is INR.`;

const TOOLS: ToolDef[] = [
  { type: "function", function: { name: "search_leads", description: "Query the lead database (CRM). Use for hot leads, leads by city/state/category/stage, leads without verified contacts.", parameters: { type: "object", properties: {
    priority: { type: "string", enum: ["hot", "warm", "potential", "low"] }, city: { type: "string" }, state: { type: "string" }, region: { type: "string", enum: ["west", "north", "south", "east", "central"] },
    category: { type: "string" }, stage: { type: "string" }, without_verified_contact: { type: "boolean" }, text: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "follow_ups_due", description: "Follow-ups and activities due on a date range (default today) or overdue.", parameters: { type: "object", properties: { scope: { type: "string", enum: ["today", "overdue", "this_week"] }, mine_only: { type: "boolean" } } } } },
  { type: "function", function: { name: "no_response_companies", description: "Companies/contacts that were sent an introduction email but have not replied after N days.", parameters: { type: "object", properties: { days: { type: "number" } } } } },
  { type: "function", function: { name: "search_projects", description: "Search projects already in the database by text, city, category, stage or expected start window.", parameters: { type: "object", properties: { text: { type: "string" }, city: { type: "string" }, state: { type: "string" }, category: { type: "string" }, stage: { type: "string" }, starting_within_months: { type: "number" }, opportunity_class: { type: "string", enum: ["CONFIRMED_REQUIREMENT", "POTENTIAL_OPPORTUNITY", "UNVERIFIED_ANNOUNCEMENT"] }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "search_companies", description: "Search companies in the database (e.g. PMCs in Pune, retail chains).", parameters: { type: "object", properties: { company_type: { type: "string" }, city: { type: "string" }, text: { type: "string" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "search_contacts", description: "Search decision-makers already in the database by company, designation text or role group.", parameters: { type: "object", properties: { company: { type: "string" }, designation: { type: "string" }, role_group: { type: "string" }, verified_only: { type: "boolean" }, limit: { type: "number" } } } } },
  { type: "function", function: { name: "get_project", description: "Full profile of one project (by project code, lead code or name) for summarising contracting potential.", parameters: { type: "object", properties: { ref: { type: "string" } }, required: ["ref"] } } },
  { type: "function", function: { name: "search_tenders", description: "Tenders/RFQs in the database.", parameters: { type: "object", properties: { status: { type: "string", enum: ["active", "closing_soon", "upcoming", "closed"] }, text: { type: "string" }, state: { type: "string" } } } } },
  { type: "function", function: { name: "create_email_draft", description: "Create an email DRAFT for a contact using a template slug (company_introduction, empanelment, project_enquiry, request_boq, intro_follow_up, quotation_submission, quotation_follow_up, meeting_request, vendor_registration, capability_presentation). Returns the draft for the user to edit and approve.", parameters: { type: "object", properties: { contact: { type: "string", description: "Contact code, email or full name" }, template: { type: "string" }, lead_code: { type: "string" } }, required: ["contact", "template"] } } },
  { type: "function", function: { name: "propose_research", description: "Propose a web research job (projects, tenders or decision_makers). Does NOT run it — the user must start it.", parameters: { type: "object", properties: {
    kind: { type: "string", enum: ["projects", "tenders", "decision_makers"] }, cities: { type: "array", items: { type: "string" } }, states: { type: "array", items: { type: "string" } },
    region: { type: "string", enum: ["all", "west", "north"] }, categories: { type: "array", items: { type: "string" } }, keywords: { type: "array", items: { type: "string" } },
    period: { type: "string", enum: ["7d", "30d", "90d", "6m", "12m", "upcoming12m"] }, company: { type: "string" }, target_count: { type: "number" } }, required: ["kind"] } } },
];

type Args = Record<string, unknown>;
const lim = (n: unknown, d = 20) => Math.min(50, Math.max(1, Number(n) || d));
const like = (s: unknown) => `%${escapeLike(String(s))}%`;

async function runTool(ctx: Ctx, name: string, a: Args) {
  const db = ctx.supabase;
  switch (name) {
    case "search_leads": {
      let q = db.from("v_leads").select("id,lead_code,title,project_name,company_name,city,state,category,stage,score,priority,contact_name,contact_designation,contact_email_status,next_follow_up,estimated_value", { count: "exact" }).is("deleted_at", null).is("archived_at", null);
      if (a.priority) q = q.eq("priority", a.priority as string);
      if (a.city) q = q.ilike("city", like(a.city));
      if (a.state) q = q.ilike("state", like(a.state));
      if (a.region) q = q.in("state", statesForRegions([a.region as string]));
      if (a.category) q = q.ilike("category", like(a.category));
      if (a.stage) q = q.eq("stage", a.stage as string);
      if (a.without_verified_contact) q = q.or("contact_email_status.is.null,contact_email_status.neq.verified");
      if (a.text) q = q.or(`project_name.ilike.${like(a.text)},company_name.ilike.${like(a.text)}`);
      const { data, count, error } = await q.order("score", { ascending: false }).limit(lim(a.limit));
      if (error) throw error;
      return { total_matching: count, leads: data };
    }
    case "follow_ups_due": {
      const now = new Date(); const start = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })); start.setHours(0, 0, 0, 0);
      const offset = now.getTime() - new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" })).getTime();
      const s = new Date(start.getTime() + offset); const e = new Date(s.getTime() + (a.scope === "this_week" ? 7 : 1) * 86400000);
      let q = db.from("v_follow_ups").select("id,title,activity_type,due_at,lead_title,lead_code,company_name,contact_name,assigned_name,next_action").eq("status", "pending");
      q = a.scope === "overdue" ? q.lt("due_at", now.toISOString()) : q.gte("due_at", s.toISOString()).lt("due_at", e.toISOString());
      if (a.mine_only) q = q.eq("assigned_to", ctx.user.id);
      const { data, error } = await q.order("due_at").limit(50);
      if (error) throw error;
      return { count: data?.length ?? 0, follow_ups: data };
    }
    case "no_response_companies": {
      const days = Number(a.days ?? 7);
      const cutoff = new Date(Date.now() - days * 86400000).toISOString();
      const { data, error } = await db.from("v_email_logs").select("id,to_email,subject,sent_at,contact_name,company_name,lead_title,lead_id").eq("status", "sent").is("replied_at", null).lt("sent_at", cutoff).order("sent_at").limit(50);
      if (error) throw error;
      return { note: "Reply detection requires Gmail reply tracking (GMAIL_TRACK_REPLIES=true) or manually logged replies.", days, count: data?.length ?? 0, emails: data };
    }
    case "search_projects": {
      let q = db.from("v_projects").select("id,project_code,name,client_name,city,state,category,current_stage,opportunity_class,area_sqft,interior_commencement,expected_completion,lead_score,primary_source_url", { count: "exact" }).is("deleted_at", null);
      if (a.text) q = q.or(`name.ilike.${like(a.text)},client_name.ilike.${like(a.text)},description.ilike.${like(a.text)}`);
      if (a.city) q = q.ilike("city", like(a.city));
      if (a.state) q = q.ilike("state", like(a.state));
      if (a.category) q = q.ilike("category", like(a.category));
      if (a.stage) q = q.eq("current_stage", a.stage as string);
      if (a.opportunity_class) q = q.eq("opportunity_class", a.opportunity_class as string);
      if (a.starting_within_months) q = q.lte("interior_commencement", new Date(Date.now() + Number(a.starting_within_months) * 30 * 86400000).toISOString().slice(0, 10)).gte("interior_commencement", new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
      const { data, count, error } = await q.order("lead_score", { ascending: false, nullsFirst: false }).limit(lim(a.limit));
      if (error) throw error;
      return { total_matching: count, projects: data };
    }
    case "search_companies": {
      let q = db.from("v_companies").select("id,name,company_type,city,state,website,project_count,contact_count").is("deleted_at", null);
      if (a.company_type) q = q.eq("company_type", a.company_type as string);
      if (a.city) q = q.or(`city.ilike.${like(a.city)},headquarters.ilike.${like(a.city)}`);
      if (a.text) q = q.ilike("name", like(a.text));
      const { data, error } = await q.limit(lim(a.limit));
      if (error) throw error;
      return { count: data?.length ?? 0, companies: data };
    }
    case "search_contacts": {
      let q = db.from("v_contacts").select("id,contact_code,full_name,designation,company_name,role_group,direct_email,company_email,email_verification_status,linkedin_url").is("deleted_at", null);
      if (a.company) q = q.ilike("company_name", like(a.company));
      if (a.designation) q = q.ilike("designation", like(a.designation));
      if (a.role_group) q = q.eq("role_group", a.role_group as string);
      if (a.verified_only) q = q.eq("email_verification_status", "verified");
      const { data, error } = await q.limit(lim(a.limit));
      if (error) throw error;
      return { count: data?.length ?? 0, contacts: data };
    }
    case "get_project": {
      const ref = String(a.ref);
      let { data } = await db.from("v_projects").select("*").or(`project_code.eq.${escapeLike(ref)},name.ilike.${like(ref)}`).is("deleted_at", null).limit(1);
      if (!data?.length) {
        const { data: l } = await db.from("leads").select("project_id").eq("lead_code", ref).maybeSingle();
        if (l?.project_id) ({ data } = await db.from("v_projects").select("*").eq("id", l.project_id).limit(1));
      }
      const p = data?.[0];
      if (!p) return { found: false };
      const [{ data: st }, { data: src }, { data: ct }] = await Promise.all([
        db.from("project_stakeholders").select("stakeholder_name,role").eq("project_id", p.id),
        db.from("lead_sources").select("url,title,excerpt").eq("project_id", p.id).limit(5),
        db.from("contacts").select("full_name,designation,email_verification_status").eq("project_id", p.id).is("deleted_at", null).limit(10),
      ]);
      return { found: true, project: p, stakeholders: st, sources: src, contacts: ct };
    }
    case "search_tenders": {
      let q = db.from("v_tenders").select("id,tender_code,organisation,title,reference_number,state,submission_deadline,deadline_status,estimated_value,source_url").is("deleted_at", null);
      if (a.status) q = q.eq("deadline_status", a.status as string);
      if (a.text) q = q.or(`title.ilike.${like(a.text)},organisation.ilike.${like(a.text)}`);
      if (a.state) q = q.ilike("state", like(a.state));
      const { data, error } = await q.order("submission_deadline", { ascending: true, nullsFirst: false }).limit(30);
      if (error) throw error;
      return { count: data?.length ?? 0, tenders: data };
    }
    case "create_email_draft": {
      const ref = String(a.contact);
      const { data: cs } = await db.from("v_contacts").select("*").or(`contact_code.eq.${escapeLike(ref)},direct_email.eq.${escapeLike(ref)},company_email.eq.${escapeLike(ref)},full_name.ilike.${like(ref)}`).is("deleted_at", null).limit(2);
      if (!cs?.length) return { error: "No matching contact in the database." };
      if (cs.length > 1) return { error: "More than one contact matches — ask the user which one.", matches: cs.map((c) => `${c.full_name} (${c.contact_code}, ${c.company_name ?? "no company"})`) };
      const c = cs[0];
      const to = c.direct_email ?? c.company_email;
      if (!to) return { error: `${c.full_name} has no email address on record. Use FIND BUSINESS EMAIL first.` };
      const { data: t } = await db.from("email_templates").select("*").eq("slug", String(a.template)).maybeSingle();
      if (!t) return { error: "Unknown template." };
      let lead: { id: string; title: string | null; project_id: string | null } | null = null;
      if (a.lead_code) ({ data: lead } = await db.from("leads").select("id,title,project_id").eq("lead_code", String(a.lead_code)).maybeSingle());
      if (!lead) ({ data: lead } = await db.from("leads").select("id,title,project_id").or(`primary_contact_id.eq.${c.id}${c.project_id ? `,project_id.eq.${c.project_id}` : ""}`).is("deleted_at", null).limit(1).maybeSingle());
      const { data: proj } = lead?.project_id ? await db.from("projects").select("name,city").eq("id", lead.project_id).maybeSingle() : { data: null };
      const { data: settings } = await db.from("application_settings").select("value").eq("key", "company").maybeSingle();
      const co = (settings?.value ?? {}) as { introduction?: string; website?: string };
      const vars = { contact_name: c.full_name?.split(" ")[0] ? c.full_name : null, company_name: c.company_name, project_name: proj?.name ?? c.project_name, city: proj?.city ?? c.office_location, sender_name: ctx.profile.full_name, sender_designation: ctx.profile.designation, sender_phone: ctx.profile.phone, kaya_website: co.website, company_introduction: co.introduction };
      const subj = renderTemplate(t.subject, vars); const bodyR = renderTemplate(t.body, vars);
      const { data: draft, error } = await db.from("email_logs").insert({ to_email: to, subject: subj.text, body: bodyR.text, contact_id: c.id, company_id: c.company_id, lead_id: lead?.id ?? null, template_id: t.id, status: "draft", created_by: ctx.user.id }).select("id").single();
      if (error) throw error;
      return { draft_id: draft.id, to, subject: subj.text, body: bodyR.text, unfilled_placeholders: [...new Set([...subj.missing, ...bodyR.missing])], note: "Saved as a draft in Email Centre. Nothing has been sent." };
    }
    case "propose_research":
      return { proposal: a, note: "Shown to the user as a 'Start research' button. Not started." };
  }
  return { error: `Unknown tool ${name}` };
}

export async function runAssistant(ctx: Ctx, history: { role: "user" | "assistant"; content: string }[]) {
  const messages: ChatMessage[] = [{ role: "system", content: `${SYSTEM}\nToday is ${new Date().toISOString().slice(0, 10)}. User: ${ctx.profile.full_name ?? ctx.profile.email} (${ctx.profile.role}).` }, ...history.slice(-16)];
  const proposals: Args[] = []; const drafts: Args[] = []; const toolLog: { name: string; args: Args }[] = [];
  for (let i = 0; i < 6; i++) {
    const r = await chat(messages, { tools: TOOLS, userId: ctx.user.id, operation: "assistant", temperature: 0.2 });
    const m = r.message;
    if (!m.tool_calls?.length) return { reply: m.content ?? "", proposals, drafts, tools: toolLog };
    messages.push({ role: "assistant", content: m.content ?? null, tool_calls: m.tool_calls });
    for (const tc of m.tool_calls) {
      let args: Args = {}; try { args = JSON.parse(tc.function.arguments || "{}"); } catch { /* empty */ }
      toolLog.push({ name: tc.function.name, args });
      let out: unknown;
      try { out = await runTool(ctx, tc.function.name, args); } catch (e) { out = { error: (e as Error).message }; }
      if (tc.function.name === "propose_research") proposals.push(args);
      if (tc.function.name === "create_email_draft" && (out as Args)?.draft_id) drafts.push(out as Args);
      messages.push({ role: "tool", tool_call_id: tc.id, content: JSON.stringify(out).slice(0, 24000) });
    }
  }
  return { reply: "I could not complete that request in the allowed number of steps. Please narrow the question.", proposals, drafts, tools: toolLog };
}
