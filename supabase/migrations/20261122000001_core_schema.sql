-- =====================================================================
-- KAYA PROJECT INTELLIGENCE 360 — Core schema
-- Supabase PostgreSQL. Run in order with `supabase db push` or the SQL editor.
-- =====================================================================

create extension if not exists pgcrypto;
create extension if not exists pg_trgm;

-- ---------------------------------------------------------------------
-- Enumerations
-- ---------------------------------------------------------------------
do $$ begin
  create type public.app_role as enum ('administrator','bd_manager','sales_executive','researcher','viewer');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.opportunity_class as enum ('CONFIRMED_REQUIREMENT','POTENTIAL_OPPORTUNITY','UNVERIFIED_ANNOUNCEMENT');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.pipeline_stage as enum (
    'newly_discovered','research_pending','decision_maker_identified','contact_verified',
    'intro_email_sent','follow_up_required','meeting_scheduled','site_visit_scheduled',
    'boq_rfq_received','quotation_submitted','technical_discussion','commercial_negotiation',
    'project_awarded','lost','on_hold');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.email_verification_status as enum ('verified','invalid','catch_all','unknown','pending','not_checked');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.phone_status as enum ('official_company','public_professional','unverified','unavailable');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.verification_state as enum ('verified','partially_verified','unverified','outdated');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.activity_type as enum ('phone_call','email','whatsapp','linkedin','meeting','site_visit','boq_received','quotation_submitted','negotiation','tender_deadline','other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------
-- Utility functions
-- ---------------------------------------------------------------------
create or replace function public.normalize_text(t text) returns text
language sql immutable parallel safe as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(t,'')), '\m(private|pvt|limited|ltd|llp|inc|the|co|company|corporation|corp)\M', '', 'g'),
      '[^a-z0-9]+', '', 'g'),
    '')
$$;

create or replace function public.normalize_domain(url text) returns text
language sql immutable parallel safe as $$
  select nullif(
    regexp_replace(
      regexp_replace(lower(coalesce(url,'')), '^(https?://)?(www\.)?', ''),
      '[/?#:].*$', ''),
    '')
$$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

-- ---------------------------------------------------------------------
-- 1. profiles
-- ---------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  designation text,
  role public.app_role not null default 'viewer',
  is_active boolean not null default true,
  avatar_url text,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists profiles_email_key on public.profiles (lower(email));

-- Role helpers (SECURITY DEFINER so RLS on profiles does not recurse)
create or replace function public.current_app_role() returns public.app_role
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and is_active
$$;
create or replace function public.is_member() returns boolean
language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and is_active)
$$;
create or replace function public.can_write() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('administrator','bd_manager','sales_executive','researcher'), false)
$$;
create or replace function public.is_manager() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() in ('administrator','bd_manager'), false)
$$;
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce(public.current_app_role() = 'administrator', false)
$$;

-- New auth user -> profile. First user ever becomes administrator; everyone
-- else is a viewer until an administrator assigns a role (role is never read
-- from user-controlled metadata).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare first_user boolean;
begin
  select not exists(select 1 from public.profiles) into first_user;
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          case when first_user then 'administrator'::public.app_role else 'viewer'::public.app_role end)
  on conflict (id) do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 2. companies
-- ---------------------------------------------------------------------
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 300),
  normalized_name text generated always as (public.normalize_text(name)) stored,
  company_type text not null default 'corporate_client' check (company_type in (
    'corporate_client','real_estate_developer','property_owner','architecture_firm','interior_design_firm',
    'pmc','design_and_build','general_contractor','epc_contractor','facility_management','retail_chain',
    'hospital_chain','hotel_group','bank','educational_institution','government','other')),
  industry text,
  website text,
  domain text generated always as (public.normalize_domain(website)) stored,
  headquarters text,
  office_locations text[] not null default '{}',
  registered_address text,
  company_size text,
  business_category text,
  current_projects_summary text,
  expansion_activity text,
  procurement_department text,
  vendor_registration_url text,
  linkedin_url text,
  official_email text check (official_email is null or official_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  official_phone text,
  city text,
  state text,
  notes text,
  research_date date,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists companies_normalized_name_uq on public.companies (normalized_name) where deleted_at is null;
create unique index if not exists companies_domain_uq on public.companies (domain) where deleted_at is null and domain is not null;
create index if not exists companies_name_trgm on public.companies using gin (name gin_trgm_ops);
create index if not exists companies_type_idx on public.companies (company_type);

-- ---------------------------------------------------------------------
-- 3. projects
-- ---------------------------------------------------------------------
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  project_code text unique default ('PRJ-' || to_char(now(),'YYMM') || '-' || upper(substr(md5(gen_random_uuid()::text),1,6))),
  name text not null check (length(trim(name)) between 2 and 400),
  reference_number text,
  client_company_id uuid references public.companies(id) on delete set null,
  parent_organisation text,
  category text,
  description text,
  -- location
  country text not null default 'India',
  state text,
  city text,
  locality text,
  full_address text,
  pin_code text check (pin_code is null or pin_code ~ '^[1-9][0-9]{5}$'),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  geocode_source text,
  -- details
  area_sqft numeric check (area_sqft is null or area_sqft >= 0),
  size_band text check (size_band is null or size_band in ('lt_5k','5k_10k','10k_25k','25k_50k','50k_100k','gt_100k','unknown')),
  floors integer check (floors is null or floors >= 0),
  building_type text,
  estimated_project_value numeric check (estimated_project_value is null or estimated_project_value >= 0),
  estimated_interior_value numeric check (estimated_interior_value is null or estimated_interior_value >= 0),
  announcement_date date,
  start_date date,
  expected_completion date,
  current_stage text check (current_stage is null or current_stage in ('announced','planning','design','tendering','construction','interior_fit_out','renovation','vendor_appointment_pending','completed','unknown')),
  interior_commencement date,
  contractor_appointment_status text check (contractor_appointment_status is null or contractor_appointment_status in ('not_started','open','in_progress','appointed','unknown')),
  -- opportunity
  opportunity_class public.opportunity_class not null default 'UNVERIFIED_ANNOUNCEMENT',
  opportunity_evidence text,
  interior_execution_potential text,
  req_civil_finishing boolean,
  req_furniture boolean,
  req_mep boolean,
  req_flooring boolean,
  req_ceiling_partition boolean,
  req_carpentry_joinery boolean,
  req_renovation boolean,
  outsourcing_potential text,
  relevance_reason text,
  -- sources
  primary_source_url text,
  primary_source_title text,
  secondary_reference text,
  last_researched_at timestamptz,
  verification_status public.verification_state not null default 'unverified',
  dedupe_key text generated always as (public.normalize_text(name) || '|' || coalesce(public.normalize_text(city),'')) stored,
  discovery_job_id uuid,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists projects_dedupe_uq on public.projects (dedupe_key) where deleted_at is null;
create unique index if not exists projects_source_uq on public.projects (primary_source_url, name) where deleted_at is null and primary_source_url is not null;
create index if not exists projects_state_city_idx on public.projects (state, city);
create index if not exists projects_category_idx on public.projects (category);
create index if not exists projects_stage_idx on public.projects (current_stage);
create index if not exists projects_client_idx on public.projects (client_company_id);
create index if not exists projects_name_trgm on public.projects using gin (name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 5. contacts (before leads, which reference them)
-- ---------------------------------------------------------------------
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  contact_code text unique default ('CON-' || upper(substr(md5(gen_random_uuid()::text),1,8))),
  full_name text not null check (length(trim(full_name)) between 2 and 200),
  normalized_name text generated always as (public.normalize_text(full_name)) stored,
  designation text,
  role_group text check (role_group is null or role_group in ('project_management','procurement','corporate_facilities','design','pmc_contracting','leadership','other')),
  company_id uuid references public.companies(id) on delete set null,
  department text,
  -- company-level vs direct personal professional details are kept apart
  company_email text check (company_email is null or company_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  direct_email text check (direct_email is null or direct_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  direct_email_source text,               -- where the direct email was found (URL or provider)
  email_verification_status public.email_verification_status not null default 'not_checked',
  email_verified_at timestamptz,
  email_verification_provider text,
  email_confidence numeric,
  company_phone text,
  professional_phone text,
  phone_status public.phone_status not null default 'unavailable',
  linkedin_url text check (linkedin_url is null or linkedin_url ~* '^https?://([a-z]{2,3}\.)?linkedin\.com/'),
  office_location text,
  project_id uuid references public.projects(id) on delete set null,
  source_url text,
  source_note text,
  last_verified_at timestamptz,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists contacts_company_name_uq on public.contacts (company_id, normalized_name) where deleted_at is null;
create unique index if not exists contacts_direct_email_uq on public.contacts (lower(direct_email)) where deleted_at is null and direct_email is not null;
create index if not exists contacts_company_idx on public.contacts (company_id);
create index if not exists contacts_verif_idx on public.contacts (email_verification_status);
create index if not exists contacts_name_trgm on public.contacts using gin (full_name gin_trgm_ops);

-- ---------------------------------------------------------------------
-- 4. leads
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  lead_code text unique default ('LD-' || to_char(now(),'YYMM') || '-' || upper(substr(md5(gen_random_uuid()::text),1,6))),
  title text,
  project_id uuid references public.projects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  primary_contact_id uuid references public.contacts(id) on delete set null,
  tender_id uuid,
  stage public.pipeline_stage not null default 'newly_discovered',
  stage_position integer not null default 0,
  lead_source text not null default 'manual' check (lead_source in ('ai_discovery','tender_discovery','manual','referral','inbound','import','demo')),
  score_auto integer not null default 0 check (score_auto between 0 and 100),
  score_adjustment integer not null default 0 check (score_adjustment between -100 and 100),
  score_adjustment_reason text,
  score integer generated always as (greatest(0, least(100, score_auto + score_adjustment))) stored,
  score_breakdown jsonb not null default '[]',
  scored_at timestamptz,
  assigned_to uuid references public.profiles(id) on delete set null,
  last_contact_date timestamptz,
  next_follow_up timestamptz,
  estimated_value numeric check (estimated_value is null or estimated_value >= 0),
  lost_reason text,
  notes text,
  discovered_at timestamptz not null default now(),
  is_demo boolean not null default false,
  archived_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint leads_adjust_reason check (score_adjustment = 0 or length(coalesce(score_adjustment_reason,'')) >= 5)
);
alter table public.leads add column if not exists priority text generated always as (
  case when greatest(0, least(100, score_auto + score_adjustment)) >= 80 then 'hot'
       when greatest(0, least(100, score_auto + score_adjustment)) >= 60 then 'warm'
       when greatest(0, least(100, score_auto + score_adjustment)) >= 40 then 'potential'
       else 'low' end) stored;
create unique index if not exists leads_project_uq on public.leads (project_id) where deleted_at is null and project_id is not null;
create index if not exists leads_stage_idx on public.leads (stage, stage_position);
create index if not exists leads_score_idx on public.leads (score desc);
create index if not exists leads_assigned_idx on public.leads (assigned_to);
create index if not exists leads_followup_idx on public.leads (next_follow_up);
create index if not exists leads_company_idx on public.leads (company_id);

-- ---------------------------------------------------------------------
-- 6. project_stakeholders
-- ---------------------------------------------------------------------
create table if not exists public.project_stakeholders (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  stakeholder_name text not null,
  role text not null check (role in ('client','developer','architect','interior_designer','pmc','design_and_build','general_contractor','procurement_agency','existing_contractor','other')),
  source_url text,
  confirmed boolean not null default false,
  created_at timestamptz not null default now(),
  unique (project_id, role, stakeholder_name)
);
create index if not exists stakeholders_project_idx on public.project_stakeholders (project_id);

-- ---------------------------------------------------------------------
-- 10. tenders
-- ---------------------------------------------------------------------
create table if not exists public.tenders (
  id uuid primary key default gen_random_uuid(),
  tender_code text unique default ('TND-' || upper(substr(md5(gen_random_uuid()::text),1,8))),
  organisation text not null,
  organisation_company_id uuid references public.companies(id) on delete set null,
  title text not null,
  reference_number text,             -- only as published by the source; never generated
  work_description text,
  category text,
  location text,
  state text,
  city text,
  estimated_value numeric,
  emd_amount numeric,
  publication_date date,
  submission_deadline timestamptz,   -- only as published by the source
  eligibility text,
  required_experience text,
  document_url text,
  submission_url text,
  status text not null default 'unknown' check (status in ('active','upcoming','closed','cancelled','awarded','unknown')),
  source_url text,
  source_title text,
  last_verified_at timestamptz,
  verification_status public.verification_state not null default 'unverified',
  discovery_job_id uuid,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create unique index if not exists tenders_ref_uq on public.tenders (public.normalize_text(organisation), reference_number) where deleted_at is null and reference_number is not null;
create unique index if not exists tenders_source_uq on public.tenders (source_url, title) where deleted_at is null and source_url is not null;
create index if not exists tenders_deadline_idx on public.tenders (submission_deadline);
create index if not exists tenders_state_idx on public.tenders (state);
alter table public.leads drop constraint if exists leads_tender_fk;
alter table public.leads add constraint leads_tender_fk foreign key (tender_id) references public.tenders(id) on delete set null;

-- 11. tender_documents
create table if not exists public.tender_documents (
  id uuid primary key default gen_random_uuid(),
  tender_id uuid not null references public.tenders(id) on delete cascade,
  title text not null,
  url text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (url is not null or storage_path is not null)
);

-- Project attachments (drawings, BOQs, photos, correspondence, site reports, quotations)
create table if not exists public.project_attachments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  kind text not null check (kind in ('drawing','boq','tender_document','photograph','correspondence','site_visit_report','quotation','other')),
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  size_bytes bigint,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7. lead_sources — every evidence URL behind a project/company/contact/tender
-- ---------------------------------------------------------------------
create table if not exists public.lead_sources (
  id uuid primary key default gen_random_uuid(),
  project_id uuid references public.projects(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade,
  contact_id uuid references public.contacts(id) on delete cascade,
  tender_id uuid references public.tenders(id) on delete cascade,
  url text not null,
  title text,
  publisher text,
  published_at date,
  excerpt text,
  source_type text not null default 'web' check (source_type in ('web','news','press_release','company_website','tender_portal','linkedin','directory','enrichment_api','manual')),
  is_primary boolean not null default false,
  retrieved_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  check (num_nonnulls(project_id, company_id, contact_id, tender_id) >= 1)
);
create index if not exists lead_sources_project_idx on public.lead_sources (project_id);
create index if not exists lead_sources_company_idx on public.lead_sources (company_id);
create index if not exists lead_sources_contact_idx on public.lead_sources (contact_id);
create unique index if not exists lead_sources_uq on public.lead_sources (url, coalesce(project_id, company_id, contact_id, tender_id));

-- ---------------------------------------------------------------------
-- 8. lead_activities (activity history incl. pipeline moves)
-- ---------------------------------------------------------------------
create table if not exists public.lead_activities (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  kind text not null check (kind in ('note','stage_change','score_change','assignment','email','call','meeting','site_visit','follow_up','verification','system')),
  summary text not null,
  from_stage public.pipeline_stage,
  to_stage public.pipeline_stage,
  metadata jsonb not null default '{}',
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists lead_activities_lead_idx on public.lead_activities (lead_id, created_at desc);

-- ---------------------------------------------------------------------
-- 9. follow_ups
-- ---------------------------------------------------------------------
create table if not exists public.follow_ups (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete cascade,
  company_id uuid references public.companies(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  tender_id uuid references public.tenders(id) on delete cascade,
  activity_type public.activity_type not null default 'phone_call',
  title text not null,
  due_at timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes between 5 and 1440),
  notes text,
  next_action text,
  assigned_to uuid references public.profiles(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','done','cancelled')),
  completed_at timestamptz,
  outcome text,
  external_calendar_id text,
  is_demo boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists follow_ups_due_idx on public.follow_ups (status, due_at);
create index if not exists follow_ups_assigned_idx on public.follow_ups (assigned_to, due_at);
create index if not exists follow_ups_lead_idx on public.follow_ups (lead_id);

-- ---------------------------------------------------------------------
-- 12. discovery_jobs + discovery_results (review queue)
-- ---------------------------------------------------------------------
create table if not exists public.discovery_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null default 'projects' check (kind in ('projects','tenders','decision_makers')),
  title text,
  params jsonb not null default '{}',
  status text not null default 'queued' check (status in ('queued','running','paused','cancelled','completed','failed','needs_configuration')),
  queries jsonb not null default '[]',          -- [{q, provider?, status, results, error}]
  cursor integer not null default 0,
  visited_urls text[] not null default '{}',
  stats jsonb not null default '{"queries_executed":0,"websites_researched":0,"projects_identified":0,"companies_identified":0,"contacts_discovered":0,"duplicates_removed":0,"awaiting_review":0,"api_errors":0}',
  errors jsonb not null default '[]',
  trigger text not null default 'manual' check (trigger in ('manual','schedule','assistant')),
  started_at timestamptz,
  finished_at timestamptz,
  lock_until timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists discovery_jobs_status_idx on public.discovery_jobs (status, created_at desc);

create table if not exists public.discovery_results (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.discovery_jobs(id) on delete cascade,
  result_type text not null check (result_type in ('project','tender','contact')),
  title text not null,
  payload jsonb not null,
  source_url text not null,
  source_title text,
  opportunity_class public.opportunity_class,
  preview_score integer,
  review_status text not null default 'pending' check (review_status in ('pending','saved','rejected','duplicate')),
  duplicate_of uuid,
  duplicate_reason text,
  saved_record_id uuid,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (job_id, result_type, title, source_url)
);
create index if not exists discovery_results_job_idx on public.discovery_results (job_id, review_status);

-- 13. saved_searches
create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kind text not null default 'projects' check (kind in ('projects','tenders','decision_makers','leads')),
  params jsonb not null default '{}',
  schedule text not null default 'none' check (schedule in ('none','daily','weekly','monthly')),
  last_run_at timestamptz,
  owner_id uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 14. email_verifications
create table if not exists public.email_verifications (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references public.contacts(id) on delete set null,
  email text not null,
  provider text not null check (provider in ('hunter','neverbounce','zerobounce')),
  status public.email_verification_status not null,
  raw_result text,
  confidence numeric,
  response jsonb not null default '{}',
  checked_by uuid references public.profiles(id) on delete set null,
  checked_at timestamptz not null default now()
);
create index if not exists email_verifications_email_idx on public.email_verifications (lower(email), checked_at desc);

-- 15. email_templates
create table if not exists public.email_templates (
  id uuid primary key default gen_random_uuid(),
  slug text unique,
  name text not null,
  category text not null default 'general',
  subject text not null,
  body text not null,
  is_system boolean not null default false,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 16. email_logs (drafts, approvals, sends)
create table if not exists public.email_logs (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid references public.leads(id) on delete set null,
  contact_id uuid references public.contacts(id) on delete set null,
  company_id uuid references public.companies(id) on delete set null,
  template_id uuid references public.email_templates(id) on delete set null,
  to_email text not null check (to_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  cc text,
  subject text not null,
  body text not null,
  status text not null default 'draft' check (status in ('draft','approved','sending','sent','failed','received')),
  provider text,
  provider_message_id text,
  provider_thread_id text,
  error text,
  approved_by uuid references public.profiles(id) on delete set null,
  approved_at timestamptz,
  sent_at timestamptz,
  replied_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists email_logs_lead_idx on public.email_logs (lead_id);
create index if not exists email_logs_status_idx on public.email_logs (status, created_at desc);

-- Connected mailbox per user (OAuth tokens encrypted at application level)
create table if not exists public.email_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  provider text not null default 'gmail',
  email text not null,
  encrypted_refresh_token text not null,
  scopes text,
  connected_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- 17. notifications
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,   -- null = all members
  kind text not null default 'info' check (kind in ('info','follow_up_due','follow_up_overdue','tender_deadline','assignment','discovery_complete','integration_error','report')),
  title text not null,
  body text,
  link text,
  dedupe_key text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists notifications_dedupe_uq on public.notifications (coalesce(user_id::text,'*'), dedupe_key) where dedupe_key is not null;
create index if not exists notifications_user_idx on public.notifications (user_id, read_at, created_at desc);

-- 18. team_assignments (territory / account ownership)
create table if not exists public.team_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scope text not null check (scope in ('state','city','category','company','lead')),
  scope_value text not null,
  is_primary boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (user_id, scope, scope_value)
);

-- 19. audit_logs
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id text,
  action text not null check (action in ('INSERT','UPDATE','DELETE','SOFT_DELETE','RESTORE','EXPORT','LOGIN','SEND','VERIFY','CONFIG')),
  changed_fields text[],
  old_data jsonb,
  new_data jsonb,
  actor_id uuid,
  actor_email text,
  created_at timestamptz not null default now()
);
create index if not exists audit_logs_record_idx on public.audit_logs (table_name, record_id, created_at desc);
create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);

-- 20. application_settings
create table if not exists public.application_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Integration secrets entered via the UI (encrypted with APP_ENCRYPTION_KEY at
-- the application layer). No RLS policy grants access: only the service role reads it.
create table if not exists public.integration_secrets (
  provider text primary key,
  encrypted_value text not null,
  updated_by uuid references public.profiles(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- Usage tracking for every external API call (budget + limits + error logs)
create table if not exists public.integration_usage (
  id bigint generated always as identity primary key,
  provider text not null,
  operation text not null,
  success boolean not null,
  units integer not null default 1,
  est_cost_usd numeric not null default 0,
  status_code integer,
  error text,
  job_id uuid,
  user_id uuid,
  created_at timestamptz not null default now()
);
create index if not exists integration_usage_provider_idx on public.integration_usage (provider, created_at desc);

-- Scheduled automation run log
create table if not exists public.scheduled_job_runs (
  id bigint generated always as identity primary key,
  frequency text not null check (frequency in ('tick','daily','weekly','monthly')),
  status text not null default 'running' check (status in ('running','completed','failed','skipped')),
  summary jsonb not null default '{}',
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

-- ---------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','companies','projects','contacts','leads','tenders','follow_ups','discovery_jobs','saved_searches','email_templates','email_logs'] loop
    execute format('drop trigger if exists trg_touch_%1$s on public.%1$s', t);
    execute format('create trigger trg_touch_%1$s before update on public.%1$s for each row execute function public.touch_updated_at()', t);
  end loop;
end $$;
