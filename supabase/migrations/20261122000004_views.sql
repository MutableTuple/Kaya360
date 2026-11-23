-- =====================================================================
-- Read views for list screens (security_invoker → caller's RLS applies)
-- =====================================================================
create or replace view public.v_leads with (security_invoker = true) as
select l.*,
       p.name as project_name, p.project_code, p.city, p.state, p.category, p.current_stage as project_stage,
       p.opportunity_class, p.latitude, p.longitude, p.area_sqft,
       co.name as company_name,
       ct.full_name as contact_name, ct.designation as contact_designation,
       coalesce(ct.direct_email, ct.company_email) as contact_email,
       ct.email_verification_status as contact_email_status,
       coalesce(ct.professional_phone, ct.company_phone) as contact_phone,
       ct.phone_status as contact_phone_status,
       pr.full_name as assigned_name, pr.email as assigned_email
  from public.leads l
  left join public.projects p on p.id = l.project_id
  left join public.companies co on co.id = l.company_id
  left join public.contacts ct on ct.id = l.primary_contact_id
  left join public.profiles pr on pr.id = l.assigned_to;

create or replace view public.v_projects with (security_invoker = true) as
select p.*, co.name as client_name,
       (select l.id from public.leads l where l.project_id = p.id and l.deleted_at is null limit 1) as lead_id,
       (select l.score from public.leads l where l.project_id = p.id and l.deleted_at is null limit 1) as lead_score,
       (select l.priority from public.leads l where l.project_id = p.id and l.deleted_at is null limit 1) as lead_priority,
       (select l.stage from public.leads l where l.project_id = p.id and l.deleted_at is null limit 1) as lead_stage,
       (select count(*) from public.contacts c where c.project_id = p.id and c.deleted_at is null) as contact_count
  from public.projects p
  left join public.companies co on co.id = p.client_company_id;

create or replace view public.v_companies with (security_invoker = true) as
select c.*,
       (select count(*) from public.projects p where p.client_company_id = c.id and p.deleted_at is null) as project_count,
       (select count(*) from public.contacts x where x.company_id = c.id and x.deleted_at is null) as contact_count,
       (select count(*) from public.leads l where l.company_id = c.id and l.deleted_at is null) as lead_count
  from public.companies c;

create or replace view public.v_contacts with (security_invoker = true) as
select c.*, co.name as company_name, co.domain as company_domain, p.name as project_name
  from public.contacts c
  left join public.companies co on co.id = c.company_id
  left join public.projects p on p.id = c.project_id;

create or replace view public.v_tenders with (security_invoker = true) as
select t.*,
       case when t.status in ('closed','cancelled','awarded') then t.status
            when t.submission_deadline is null then t.status
            when t.submission_deadline < now() then 'closed'
            when t.submission_deadline < now() + interval '7 days' then 'closing_soon'
            when t.publication_date > current_date then 'upcoming'
            else 'active' end as deadline_status,
       (select l.id from public.leads l where l.tender_id = t.id and l.deleted_at is null limit 1) as lead_id
  from public.tenders t;

create or replace view public.v_follow_ups with (security_invoker = true) as
select f.*, l.title as lead_title, l.lead_code, co.name as company_name, ct.full_name as contact_name, pr.full_name as assigned_name, t.title as tender_title
  from public.follow_ups f
  left join public.leads l on l.id = f.lead_id
  left join public.companies co on co.id = coalesce(f.company_id, l.company_id)
  left join public.contacts ct on ct.id = coalesce(f.contact_id, l.primary_contact_id)
  left join public.profiles pr on pr.id = f.assigned_to
  left join public.tenders t on t.id = f.tender_id;

create or replace view public.v_email_logs with (security_invoker = true) as
select e.*, ct.full_name as contact_name, co.name as company_name, l.title as lead_title, pr.full_name as created_by_name
  from public.email_logs e
  left join public.contacts ct on ct.id = e.contact_id
  left join public.companies co on co.id = e.company_id
  left join public.leads l on l.id = e.lead_id
  left join public.profiles pr on pr.id = e.created_by;

grant select on public.v_leads, public.v_projects, public.v_companies, public.v_contacts, public.v_tenders, public.v_follow_ups, public.v_email_logs to authenticated;
