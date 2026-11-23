"use client";
import { useEffect, useMemo, useState } from "react";
import { api, Modal, Spinner, useToast, cn } from "./ui";
import { PROJECT_CATEGORIES, PROJECT_STAGES, SIZE_BANDS, OPPORTUNITY_CLASSES, COMPANY_TYPES, PIPELINE_STAGES, ACTIVITY_TYPES, TENDER_CATEGORIES, ROLE_GROUPS } from "@/lib/constants";
import { STATES } from "@/lib/geo";

export type FieldType = "text" | "textarea" | "number" | "select" | "date" | "datetime" | "bool" | "ref" | "tags" | "url" | "email";
export interface Field { name: string; label: string; type?: FieldType; options?: readonly (readonly [string, string])[] | string[]; ref?: string; refLabel?: string; required?: boolean; span?: 1 | 2 | 3; help?: string; section?: string; placeholder?: string }

const opts = (a: readonly string[]) => a.map((x) => [x, x] as const);
const STATE_OPTS = opts(STATES.map((s) => s.name));
const TRI = [["", "Unknown"], ["true", "Yes"], ["false", "No"]] as const;

export const FORMS: Record<string, Field[]> = {
  projects: [
    { name: "name", label: "Project name", required: true, span: 2, section: "Identification" }, { name: "reference_number", label: "Project reference no." },
    { name: "client_company_id", label: "Client / company", type: "ref", ref: "companies" }, { name: "parent_organisation", label: "Parent organisation" },
    { name: "category", label: "Project category", type: "select", options: opts(PROJECT_CATEGORIES) },
    { name: "description", label: "Description", type: "textarea", span: 3 },
    { name: "state", label: "State", type: "select", options: STATE_OPTS, section: "Location" }, { name: "city", label: "City" }, { name: "locality", label: "Area / locality" },
    { name: "full_address", label: "Full address", span: 2 }, { name: "pin_code", label: "PIN code" },
    { name: "latitude", label: "Latitude", type: "number", help: "Only when reliably known" }, { name: "longitude", label: "Longitude", type: "number" },
    { name: "area_sqft", label: "Area (sq. ft.)", type: "number", section: "Project details" }, { name: "size_band", label: "Size band", type: "select", options: SIZE_BANDS }, { name: "floors", label: "Floors", type: "number" },
    { name: "building_type", label: "Building type" }, { name: "estimated_project_value", label: "Est. project value (₹)", type: "number" }, { name: "estimated_interior_value", label: "Est. interior package (₹)", type: "number" },
    { name: "announcement_date", label: "Announcement date", type: "date" }, { name: "start_date", label: "Start date", type: "date" }, { name: "expected_completion", label: "Expected completion", type: "date" },
    { name: "current_stage", label: "Current stage", type: "select", options: PROJECT_STAGES }, { name: "interior_commencement", label: "Interior work commencement", type: "date" },
    { name: "contractor_appointment_status", label: "Contractor appointment", type: "select", options: [["not_started", "Not started"], ["open", "Open / inviting"], ["in_progress", "In progress"], ["appointed", "Appointed"], ["unknown", "Unknown"]] },
    { name: "opportunity_class", label: "Opportunity classification", type: "select", options: OPPORTUNITY_CLASSES, section: "Opportunity" }, { name: "opportunity_evidence", label: "Evidence (quote from source)", type: "textarea", span: 2 },
    { name: "req_civil_finishing", label: "Civil finishing", type: "select", options: TRI }, { name: "req_furniture", label: "Furniture manufacturing", type: "select", options: TRI }, { name: "req_mep", label: "MEP", type: "select", options: TRI },
    { name: "req_flooring", label: "Flooring", type: "select", options: TRI }, { name: "req_ceiling_partition", label: "Ceiling & partition", type: "select", options: TRI }, { name: "req_carpentry_joinery", label: "Carpentry & joinery", type: "select", options: TRI },
    { name: "req_renovation", label: "Renovation", type: "select", options: TRI }, { name: "interior_execution_potential", label: "Interior execution potential", type: "textarea", span: 2 },
    { name: "outsourcing_potential", label: "Outsourcing potential", type: "textarea" }, { name: "relevance_reason", label: "Why relevant to Kaya", type: "textarea", span: 2 },
    { name: "primary_source_url", label: "Original announcement URL", type: "url", span: 2, section: "Sources" }, { name: "primary_source_title", label: "Source title" },
    { name: "secondary_reference", label: "Secondary reference", span: 2 }, { name: "verification_status", label: "Verification status", type: "select", options: [["verified", "Verified"], ["partially_verified", "Partially verified"], ["unverified", "Unverified"], ["outdated", "Outdated"]] },
  ],
  companies: [
    { name: "name", label: "Company name", required: true, span: 2 }, { name: "company_type", label: "Type", type: "select", options: COMPANY_TYPES },
    { name: "industry", label: "Industry" }, { name: "business_category", label: "Business category" }, { name: "company_size", label: "Company size (if public)" },
    { name: "website", label: "Website", type: "url" }, { name: "linkedin_url", label: "LinkedIn company page", type: "url" }, { name: "vendor_registration_url", label: "Vendor registration link", type: "url" },
    { name: "official_email", label: "Official email", type: "email" }, { name: "official_phone", label: "Official phone" }, { name: "procurement_department", label: "Procurement department" },
    { name: "headquarters", label: "Headquarters" }, { name: "city", label: "City" }, { name: "state", label: "State", type: "select", options: STATE_OPTS },
    { name: "office_locations", label: "Office locations", type: "tags", span: 2 }, { name: "registered_address", label: "Registered address", span: 3 },
    { name: "current_projects_summary", label: "Current projects", type: "textarea", span: 3 }, { name: "expansion_activity", label: "Expansion activity", type: "textarea", span: 3 },
    { name: "notes", label: "Notes", type: "textarea", span: 3 }, { name: "research_date", label: "Research date", type: "date" },
  ],
  contacts: [
    { name: "full_name", label: "Full name", required: true }, { name: "designation", label: "Designation" },
    { name: "role_group", label: "Role group", type: "select", options: [...Object.entries(ROLE_GROUPS).map(([k, v]) => [k, v.label] as const), ["leadership", "Leadership"], ["other", "Other"]] },
    { name: "company_id", label: "Company", type: "ref", ref: "companies" }, { name: "department", label: "Department" }, { name: "office_location", label: "Office location" },
    { name: "company_email", label: "Company-level email (generic inbox)", type: "email", section: "Contact details", help: "e.g. procurement@ — not a personal address" },
    { name: "direct_email", label: "Direct professional email", type: "email", help: "Only if publicly published for this person" }, { name: "direct_email_source", label: "Where the direct email was found" },
    { name: "company_phone", label: "Official company phone" }, { name: "professional_phone", label: "Public professional phone" },
    { name: "phone_status", label: "Phone status", type: "select", options: [["official_company", "Official company number"], ["public_professional", "Public professional number"], ["unverified", "Unverified number"], ["unavailable", "Unavailable"]] },
    { name: "linkedin_url", label: "LinkedIn profile", type: "url", span: 2 }, { name: "project_id", label: "Associated project", type: "ref", ref: "projects" },
    { name: "source_url", label: "Source URL", type: "url", span: 2 }, { name: "source_note", label: "Source note", type: "textarea", span: 3 },
  ],
  leads: [
    { name: "title", label: "Lead title", span: 2 }, { name: "project_id", label: "Project", type: "ref", ref: "projects" },
    { name: "company_id", label: "Company", type: "ref", ref: "companies" }, { name: "primary_contact_id", label: "Primary contact", type: "ref", ref: "contacts" },
    { name: "stage", label: "Pipeline stage", type: "select", options: PIPELINE_STAGES }, { name: "lead_source", label: "Lead source", type: "select", options: [["manual", "Manual"], ["ai_discovery", "AI discovery"], ["tender_discovery", "Tender discovery"], ["referral", "Referral"], ["inbound", "Inbound"], ["import", "Import"]] },
    { name: "assigned_to", label: "Assigned employee", type: "ref", ref: "team" }, { name: "estimated_value", label: "Est. opportunity value (₹)", type: "number" },
    { name: "last_contact_date", label: "Last contact date", type: "date" }, { name: "notes", label: "Notes", type: "textarea", span: 3 },
  ],
  tenders: [
    { name: "organisation", label: "Organisation", required: true }, { name: "title", label: "Tender title", required: true, span: 2 },
    { name: "reference_number", label: "Tender reference no.", help: "Exactly as published" }, { name: "category", label: "Category", type: "select", options: opts(TENDER_CATEGORIES) },
    { name: "status", label: "Status", type: "select", options: [["active", "Active"], ["upcoming", "Upcoming"], ["closed", "Closed"], ["cancelled", "Cancelled"], ["awarded", "Awarded"], ["unknown", "Unknown"]] },
    { name: "work_description", label: "Work description", type: "textarea", span: 3 }, { name: "location", label: "Project location" }, { name: "state", label: "State", type: "select", options: STATE_OPTS }, { name: "city", label: "City" },
    { name: "estimated_value", label: "Estimated value (₹)", type: "number" }, { name: "emd_amount", label: "EMD (₹)", type: "number" }, { name: "publication_date", label: "Publication date", type: "date" },
    { name: "submission_deadline", label: "Submission deadline", type: "datetime" }, { name: "eligibility", label: "Eligibility", type: "textarea", span: 2 }, { name: "required_experience", label: "Required experience", type: "textarea", span: 3 },
    { name: "document_url", label: "Tender document URL", type: "url", span: 2 }, { name: "submission_url", label: "Official submission URL", type: "url" }, { name: "source_url", label: "Source URL", type: "url", span: 2 },
    { name: "verification_status", label: "Verification", type: "select", options: [["verified", "Verified"], ["partially_verified", "Partially verified"], ["unverified", "Unverified"], ["outdated", "Outdated"]] },
  ],
  follow_ups: [
    { name: "title", label: "Title", required: true, span: 2 }, { name: "activity_type", label: "Activity type", type: "select", options: ACTIVITY_TYPES },
    { name: "due_at", label: "Date & time", type: "datetime", required: true }, { name: "duration_minutes", label: "Duration (min)", type: "number" }, { name: "assigned_to", label: "Assigned employee", type: "ref", ref: "team" },
    { name: "lead_id", label: "Lead", type: "ref", ref: "leads" }, { name: "company_id", label: "Company", type: "ref", ref: "companies" }, { name: "contact_id", label: "Contact", type: "ref", ref: "contacts" },
    { name: "notes", label: "Notes", type: "textarea", span: 3 }, { name: "next_action", label: "Next action", span: 2 },
    { name: "status", label: "Status", type: "select", options: [["pending", "Pending"], ["done", "Done"], ["cancelled", "Cancelled"]] }, { name: "outcome", label: "Outcome", type: "textarea", span: 3 },
  ],
  email_templates: [{ name: "name", label: "Template name", required: true }, { name: "category", label: "Category" }, { name: "subject", label: "Subject", required: true, span: 3 }, { name: "body", label: "Body", type: "textarea", required: true, span: 3, help: "Placeholders: {{contact_name}} {{company_name}} {{project_name}} {{city}} {{sender_name}} {{sender_designation}} {{sender_phone}} {{kaya_website}} {{company_introduction}}" }],
};

const REF_LABEL: Record<string, (r: Record<string, unknown>) => string> = {
  companies: (r) => String(r.name), projects: (r) => `${r.name}${r.city ? ` · ${r.city}` : ""}`, contacts: (r) => `${r.full_name}${r.company_name ? ` · ${r.company_name}` : ""}`,
  leads: (r) => `${r.lead_code} · ${r.project_name ?? r.title ?? ""}`, team: (r) => String(r.full_name ?? r.email),
};

let teamCache: Record<string, unknown>[] | null = null;
export async function loadTeam() { if (!teamCache) teamCache = (await api<{ users: Record<string, unknown>[] }>("/api/team")).users.filter((u) => u.is_active); return teamCache; }

export function RefSelect({ refName, value, onChange, initialLabel, placeholder }: { refName: string; value: string | null; onChange: (v: string | null, row?: Record<string, unknown>) => void; initialLabel?: string | null; placeholder?: string }) {
  const [q, setQ] = useState(""); const [rows, setRows] = useState<Record<string, unknown>[]>([]); const [open, setOpen] = useState(false); const [lbl, setLbl] = useState(initialLabel ?? "");
  useEffect(() => {
    if (!value) { setLbl(""); return; }
    if (initialLabel) { setLbl(initialLabel); return; }
    if (refName === "team") loadTeam().then((u) => { const r = u.find((x) => x.id === value); if (r) setLbl(REF_LABEL.team(r)); });
    else api<{ record: Record<string, unknown> }>(`/api/r/${refName}/${value}`).then((d) => setLbl(REF_LABEL[refName](d.record))).catch(() => setLbl(value));
  }, [value, refName]);
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(async () => {
      if (refName === "team") { const u = await loadTeam(); setRows(u.filter((x) => !q || REF_LABEL.team(x).toLowerCase().includes(q.toLowerCase()))); return; }
      const d = await api<{ rows: Record<string, unknown>[] }>(`/api/r/${refName}?pageSize=15&q=${encodeURIComponent(q)}`).catch(() => ({ rows: [] }));
      setRows(d.rows);
    }, 200);
    return () => clearTimeout(t);
  }, [q, open, refName]);
  return (
    <div className="relative">
      <input className="input" value={open ? q : lbl} placeholder={placeholder ?? "Search…"} onFocus={() => { setOpen(true); setQ(""); }} onBlur={() => setTimeout(() => setOpen(false), 150)} onChange={(e) => setQ(e.target.value)} />
      {value && !open && <button type="button" className="absolute right-2 top-1.5 text-xs text-slate-400 hover:text-slate-700" onClick={() => { onChange(null); setLbl(""); }}>clear</button>}
      {open && (
        <div className="absolute z-30 mt-1 max-h-64 w-full overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
          {rows.length === 0 && <div className="px-3 py-2 text-xs text-slate-500">No matches</div>}
          {rows.map((r) => (
            <button type="button" key={String(r.id)} className="block w-full truncate px-3 py-1.5 text-left text-sm hover:bg-navy-50" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(String(r.id), r); setLbl(REF_LABEL[refName](r)); setOpen(false); }}>{REF_LABEL[refName](r)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function toInput(f: Field, v: unknown) {
  if (v == null) return "";
  if (f.type === "datetime" && typeof v === "string") { const d = new Date(v); if (isNaN(d.getTime())) return ""; const off = d.getTimezoneOffset() * 60000; return new Date(d.getTime() - off).toISOString().slice(0, 16); }
  if (f.type === "date" && typeof v === "string") return v.slice(0, 10);
  if (f.type === "tags" && Array.isArray(v)) return v.join(", ");
  return String(v);
}
function fromInput(f: Field, v: string): unknown {
  if (f.type === "datetime") return v ? new Date(v).toISOString() : null;
  if (f.type === "tags") return v.split(",").map((x) => x.trim()).filter(Boolean);
  if (f.type === "number") return v === "" ? null : Number(v);
  if (f.name.startsWith("req_")) return v === "" ? null : v === "true";
  return v === "" ? null : v;
}

export function EntityForm({ resource, initial, onSaved, onCancel, defaults, fields: fieldsOverride }: { resource: string; initial?: Record<string, unknown> | null; onSaved: (rec: Record<string, unknown>) => void; onCancel?: () => void; defaults?: Record<string, unknown>; fields?: Field[] }) {
  const fields = fieldsOverride ?? FORMS[resource];
  const toast = useToast();
  const isEdit = !!initial?.id;
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(fields.map((f) => [f.name, toInput(f, initial?.[f.name] ?? defaults?.[f.name])])));
  const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  const labels = useMemo(() => ({ client_company_id: initial?.client_name, company_id: initial?.company_name, project_id: initial?.project_name, primary_contact_id: initial?.contact_name, assigned_to: initial?.assigned_name, lead_id: initial?.lead_title, contact_id: initial?.contact_name } as Record<string, string | undefined>), [initial]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr(null);
    const payload: Record<string, unknown> = { ...(defaults && !isEdit ? defaults : {}) };
    for (const f of fields) {
      const nv = fromInput(f, vals[f.name] ?? "");
      if (isEdit) { if (toInput(f, initial?.[f.name]) !== (vals[f.name] ?? "")) payload[f.name] = nv; }
      else if (nv !== null && nv !== "" && !(Array.isArray(nv) && !nv.length)) payload[f.name] = nv;
    }
    if (isEdit && !Object.keys(payload).length) { setBusy(false); onCancel?.(); return; }
    try {
      const r = await api<{ record: Record<string, unknown> }>(isEdit ? `/api/r/${resource}/${initial!.id}` : `/api/r/${resource}`, { method: isEdit ? "PATCH" : "POST", json: payload });
      toast("success", isEdit ? "Changes saved." : "Record created."); onSaved(r.record);
    } catch (e2) { setErr((e2 as Error).message); } finally { setBusy(false); }
  };
  let lastSection: string | undefined;
  return (
    <form onSubmit={submit}>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {fields.map((f) => {
          const sec = f.section && f.section !== lastSection ? f.section : null; if (f.section) lastSection = f.section;
          return (
            <div key={f.name} className={cn(f.span === 3 ? "sm:col-span-3" : f.span === 2 ? "sm:col-span-2" : "")} style={{ gridColumnStart: sec ? 1 : undefined }}>
              {sec && <div className="-mt-1 mb-2 border-b border-slate-100 pb-1 text-xs font-semibold uppercase tracking-wide text-navy-700">{sec}</div>}
              <label className="label">{f.label}{f.required && <span className="text-red-500"> *</span>}</label>
              {f.type === "textarea" ? <textarea className="input min-h-[72px]" rows={f.name === "body" ? 12 : 3} value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} required={f.required} />
                : f.type === "select" ? (
                  <select className="input" value={vals[f.name]} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} required={f.required}>
                    {!f.name.startsWith("req_") && <option value="">—</option>}
                    {(f.options as readonly (readonly [string, string])[]).map((o) => <option key={o[0]} value={o[0]}>{o[1]}</option>)}
                  </select>)
                : f.type === "ref" ? <RefSelect refName={f.ref!} value={vals[f.name] || null} initialLabel={labels[f.name]} onChange={(v) => setVals({ ...vals, [f.name]: v ?? "" })} />
                : <input className="input" type={f.type === "number" ? "number" : f.type === "date" ? "date" : f.type === "datetime" ? "datetime-local" : f.type === "url" ? "url" : f.type === "email" ? "email" : "text"} step={f.type === "number" ? "any" : undefined} value={vals[f.name]} placeholder={f.placeholder} onChange={(e) => setVals({ ...vals, [f.name]: e.target.value })} required={f.required} />}
              {f.help && <p className="mt-0.5 text-[11px] text-slate-500">{f.help}</p>}
            </div>
          );
        })}
      </div>
      {err && <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-2 text-sm text-red-700">{err}</div>}
      <div className="mt-4 flex justify-end gap-2">{onCancel && <button type="button" className="btn-secondary" onClick={onCancel}>Cancel</button>}<button className="btn-primary" disabled={busy}>{busy && <Spinner />}{isEdit ? "Save changes" : "Create"}</button></div>
    </form>
  );
}

export function EntityFormModal({ open, onClose, resource, initial, onSaved, title, defaults }: { open: boolean; onClose: () => void; resource: string; initial?: Record<string, unknown> | null; onSaved: (r: Record<string, unknown>) => void; title: string; defaults?: Record<string, unknown> }) {
  return <Modal open={open} onClose={onClose} title={title} wide><EntityForm resource={resource} initial={initial} defaults={defaults} onSaved={(r) => { onSaved(r); onClose(); }} onCancel={onClose} /></Modal>;
}
