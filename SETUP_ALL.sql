-- ===== supabase/migrations/20261122000001_core_schema.sql =====
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

-- ===== supabase/migrations/20261122000002_security_audit_functions.sql =====
-- =====================================================================
-- Audit trail, Row Level Security, reporting functions
-- =====================================================================

-- ---------------------------------------------------------------------
-- Generic audit trigger
-- ---------------------------------------------------------------------
create or replace function public.audit_row_change() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_old jsonb; v_new jsonb; v_action text; v_fields text[]; v_actor uuid; v_email text;
begin
  v_actor := auth.uid();
  select email into v_email from public.profiles where id = v_actor;
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new); v_action := 'INSERT';
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old); v_action := 'DELETE';
  else
    v_old := to_jsonb(old); v_new := to_jsonb(new);
    select array_agg(key order by key) into v_fields
      from jsonb_each(v_new) n
     where n.value is distinct from v_old -> n.key and n.key not in ('updated_at');
    if v_fields is null then return new; end if;   -- nothing meaningful changed
    v_action := 'UPDATE';
    if v_new ? 'deleted_at' then
      if (v_old->>'deleted_at') is null and (v_new->>'deleted_at') is not null then v_action := 'SOFT_DELETE';
      elsif (v_old->>'deleted_at') is not null and (v_new->>'deleted_at') is null then v_action := 'RESTORE';
      end if;
    end if;
    -- keep only changed keys to keep the log compact
    select jsonb_object_agg(k, v_old->k) into v_old from unnest(v_fields) k;
    select jsonb_object_agg(k, v_new->k) into v_new from unnest(v_fields) k;
  end if;
  insert into public.audit_logs (table_name, record_id, action, changed_fields, old_data, new_data, actor_id, actor_email)
  values (tg_table_name, coalesce(v_new->>'id', v_old->>'id', (to_jsonb(coalesce(new, old)))->>'id', (to_jsonb(coalesce(new, old)))->>'key'),
          v_action, v_fields, v_old, v_new, v_actor, v_email);
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array['profiles','companies','projects','contacts','leads','project_stakeholders','tenders','tender_documents','project_attachments','follow_ups','email_templates','email_logs','team_assignments','application_settings','saved_searches'] loop
    execute format('drop trigger if exists trg_audit_%1$s on public.%1$s', t);
    execute format('create trigger trg_audit_%1$s after insert or update or delete on public.%1$s for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- Pipeline stage changes are also written to lead_activities automatically,
-- so every drag-and-drop move is in the activity history regardless of client.
create or replace function public.log_lead_stage_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.stage is distinct from old.stage then
    insert into public.lead_activities (lead_id, kind, summary, from_stage, to_stage, created_by)
    values (new.id, 'stage_change',
            'Stage moved from ' || replace(old.stage::text,'_',' ') || ' to ' || replace(new.stage::text,'_',' '),
            old.stage, new.stage, auth.uid());
  end if;
  if new.assigned_to is distinct from old.assigned_to and new.assigned_to is not null then
    insert into public.lead_activities (lead_id, kind, summary, metadata, created_by)
    values (new.id, 'assignment', 'Lead assigned', jsonb_build_object('assigned_to', new.assigned_to), auth.uid());
    insert into public.notifications (user_id, kind, title, body, link, dedupe_key)
    values (new.assigned_to, 'assignment', 'Lead assigned to you', coalesce(new.title, new.lead_code), '/leads/' || new.id,
            'assign:' || new.id || ':' || new.assigned_to || ':' || extract(epoch from now())::bigint)
    on conflict do nothing;
  end if;
  if new.score_adjustment is distinct from old.score_adjustment then
    insert into public.lead_activities (lead_id, kind, summary, metadata, created_by)
    values (new.id, 'score_change', 'Manual score adjustment: ' || new.score_adjustment || ' (' || coalesce(new.score_adjustment_reason,'') || ')',
            jsonb_build_object('from', old.score_adjustment, 'to', new.score_adjustment), auth.uid());
  end if;
  return new;
end $$;
drop trigger if exists trg_lead_stage on public.leads;
create trigger trg_lead_stage after update on public.leads for each row execute function public.log_lead_stage_change();

-- Prevent non-admins from changing their own role / activation
create or replace function public.guard_profile_update() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (new.role is distinct from old.role or new.is_active is distinct from old.is_active)
     and auth.uid() is not null and not public.is_admin() then
    raise exception 'Only an administrator can change roles or activation';
  end if;
  if new.role is distinct from old.role and old.role = 'administrator'
     and (select count(*) from public.profiles where role = 'administrator' and is_active) <= 1 then
    raise exception 'At least one active administrator is required';
  end if;
  return new;
end $$;
drop trigger if exists trg_guard_profile on public.profiles;
create trigger trg_guard_profile before update on public.profiles for each row execute function public.guard_profile_update();

-- ---------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['profiles','companies','projects','contacts','leads','project_stakeholders','lead_sources','lead_activities',
    'follow_ups','tenders','tender_documents','project_attachments','discovery_jobs','discovery_results','saved_searches',
    'email_verifications','email_templates','email_logs','email_accounts','notifications','team_assignments','audit_logs',
    'application_settings','integration_secrets','integration_usage','scheduled_job_runs'] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Business data: every active member reads; writers create/update; managers hard-delete.
do $$
declare t text;
begin
  foreach t in array array['companies','projects','contacts','leads','project_stakeholders','lead_sources','lead_activities',
    'follow_ups','tenders','tender_documents','project_attachments','discovery_jobs','discovery_results','email_verifications','email_logs'] loop
    execute format('drop policy if exists %1$s_select on public.%1$s', t);
    execute format('drop policy if exists %1$s_insert on public.%1$s', t);
    execute format('drop policy if exists %1$s_update on public.%1$s', t);
    execute format('drop policy if exists %1$s_delete on public.%1$s', t);
    execute format('create policy %1$s_select on public.%1$s for select to authenticated using (public.is_member())', t);
    execute format('create policy %1$s_insert on public.%1$s for insert to authenticated with check (public.can_write())', t);
    execute format('create policy %1$s_update on public.%1$s for update to authenticated using (public.can_write()) with check (public.can_write())', t);
    execute format('create policy %1$s_delete on public.%1$s for delete to authenticated using (public.is_manager())', t);
  end loop;
end $$;

-- profiles
drop policy if exists profiles_select on public.profiles;
drop policy if exists profiles_update_self on public.profiles;
drop policy if exists profiles_admin_all on public.profiles;
create policy profiles_select on public.profiles for select to authenticated using (public.is_member() or id = auth.uid());
create policy profiles_update_self on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_admin_all on public.profiles for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- templates: members read, writers create, owners/managers edit
drop policy if exists email_templates_select on public.email_templates;
drop policy if exists email_templates_insert on public.email_templates;
drop policy if exists email_templates_update on public.email_templates;
drop policy if exists email_templates_delete on public.email_templates;
create policy email_templates_select on public.email_templates for select to authenticated using (public.is_member());
create policy email_templates_insert on public.email_templates for insert to authenticated with check (public.can_write());
create policy email_templates_update on public.email_templates for update to authenticated using (public.is_manager() or (created_by = auth.uid() and not is_system));
create policy email_templates_delete on public.email_templates for delete to authenticated using (public.is_manager() and not is_system);

-- saved searches: owner, managers see all
drop policy if exists saved_searches_rw on public.saved_searches;
create policy saved_searches_rw on public.saved_searches for all to authenticated
  using (owner_id = auth.uid() or public.is_manager()) with check (public.can_write() and (owner_id = auth.uid() or public.is_manager()));

-- email accounts: only owner
drop policy if exists email_accounts_owner on public.email_accounts;
create policy email_accounts_owner on public.email_accounts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- notifications: own or broadcast
drop policy if exists notifications_select on public.notifications;
drop policy if exists notifications_update on public.notifications;
create policy notifications_select on public.notifications for select to authenticated using (public.is_member() and (user_id = auth.uid() or user_id is null));
create policy notifications_update on public.notifications for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- team assignments: members read; managers write
drop policy if exists team_assignments_select on public.team_assignments;
drop policy if exists team_assignments_write on public.team_assignments;
create policy team_assignments_select on public.team_assignments for select to authenticated using (public.is_member());
create policy team_assignments_write on public.team_assignments for all to authenticated using (public.is_manager()) with check (public.is_manager());

-- audit logs: managers read; nobody writes directly (triggers are security definer)
drop policy if exists audit_logs_select on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated using (public.is_manager());

-- settings: members read, admin writes
drop policy if exists settings_select on public.application_settings;
drop policy if exists settings_write on public.application_settings;
create policy settings_select on public.application_settings for select to authenticated using (public.is_member());
create policy settings_write on public.application_settings for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- usage + job runs: managers read
drop policy if exists usage_select on public.integration_usage;
create policy usage_select on public.integration_usage for select to authenticated using (public.is_manager());
drop policy if exists runs_select on public.scheduled_job_runs;
create policy runs_select on public.scheduled_job_runs for select to authenticated using (public.is_manager());
-- integration_secrets: intentionally no policy (service role only)

-- ---------------------------------------------------------------------
-- Reporting functions (SECURITY INVOKER: they respect RLS)
-- ---------------------------------------------------------------------
create or replace function public.dashboard_stats(include_demo boolean default true)
returns jsonb language sql stable security invoker set search_path = public as $$
  with l as (select * from public.leads where deleted_at is null and archived_at is null and (include_demo or not is_demo)),
       p as (select * from public.projects where deleted_at is null and (include_demo or not is_demo)),
       c as (select * from public.contacts where deleted_at is null and (include_demo or not is_demo))
  select jsonb_build_object(
    'total_projects', (select count(*) from p),
    'total_leads', (select count(*) from l),
    'hot_leads', (select count(*) from l where priority = 'hot'),
    'warm_leads', (select count(*) from l where priority = 'warm'),
    'verified_contacts', (select count(*) from c where email_verification_status = 'verified'),
    'projects_this_month', (select count(*) from p where created_at >= date_trunc('month', now())),
    'active_enquiries', (select count(*) from l where stage in ('meeting_scheduled','site_visit_scheduled','boq_rfq_received','quotation_submitted','technical_discussion','commercial_negotiation')),
    'rfqs_received', (select count(*) from l where stage in ('boq_rfq_received','quotation_submitted','technical_discussion','commercial_negotiation','project_awarded')),
    'quotations_submitted', (select count(*) from l where stage in ('quotation_submitted','technical_discussion','commercial_negotiation','project_awarded')),
    'projects_awarded', (select count(*) from l where stage = 'project_awarded'),
    'lost', (select count(*) from l where stage = 'lost'),
    'pipeline_value', (select coalesce(sum(estimated_value),0) from l where stage not in ('lost','project_awarded')),
    'awarded_value', (select coalesce(sum(estimated_value),0) from l where stage = 'project_awarded')
  )
$$;

create or replace function public.dashboard_charts(include_demo boolean default true)
returns jsonb language sql stable security invoker set search_path = public as $$
  with l as (
    select l.*, p.state, p.city, p.category, p.current_stage
      from public.leads l left join public.projects p on p.id = l.project_id
     where l.deleted_at is null and (include_demo or not l.is_demo))
  select jsonb_build_object(
    'monthly_discovery', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'count', n) order by m),'[]') from (
        select to_char(date_trunc('month', discovered_at),'YYYY-MM') m, count(*) n
          from l where discovered_at >= date_trunc('month', now()) - interval '11 months' group by 1) s),
    'by_state', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(state,'Unknown'), 'count', n) order by n desc),'[]') from (select state, count(*) n from l group by state) s),
    'by_city', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(city,'Unknown'), 'count', n) order by n desc),'[]') from (select city, count(*) n from l group by city order by n desc limit 15) s),
    'by_category', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(category,'Unknown'), 'count', n) order by n desc),'[]') from (select category, count(*) n from l group by category) s),
    'by_project_stage', (select coalesce(jsonb_agg(jsonb_build_object('name', coalesce(current_stage,'unknown'), 'count', n) order by n desc),'[]') from (select current_stage, count(*) n from l group by current_stage) s),
    'by_pipeline_stage', (select coalesce(jsonb_agg(jsonb_build_object('name', stage, 'count', n)),'[]') from (select stage, count(*) n from l group by stage order by stage) s),
    'verification', (select coalesce(jsonb_agg(jsonb_build_object('name', email_verification_status, 'count', n)),'[]') from (
        select email_verification_status, count(*) n from public.contacts where deleted_at is null and (include_demo or not is_demo) group by 1) s),
    'monthly_enquiry_value', (select coalesce(jsonb_agg(jsonb_build_object('month', m, 'value', v) order by m),'[]') from (
        select to_char(date_trunc('month', created_at),'YYYY-MM') m, coalesce(sum(estimated_value),0) v
          from l where stage in ('boq_rfq_received','quotation_submitted','technical_discussion','commercial_negotiation','project_awarded')
           and created_at >= date_trunc('month', now()) - interval '11 months' group by 1) s),
    'quote_vs_award', jsonb_build_object(
        'quoted', (select count(*) from l where stage in ('quotation_submitted','technical_discussion','commercial_negotiation','project_awarded','lost')),
        'awarded', (select count(*) from l where stage = 'project_awarded')),
    'employee_performance', (select coalesce(jsonb_agg(x),'[]') from (
        select jsonb_build_object('name', coalesce(pr.full_name, pr.email, 'Unassigned'),
               'leads', count(*), 'hot', count(*) filter (where l.priority='hot'),
               'quoted', count(*) filter (where l.stage in ('quotation_submitted','technical_discussion','commercial_negotiation','project_awarded')),
               'awarded', count(*) filter (where l.stage='project_awarded')) x
          from l left join public.profiles pr on pr.id = l.assigned_to group by pr.full_name, pr.email) s)
  )
$$;

grant execute on function public.dashboard_stats(boolean) to authenticated;
grant execute on function public.dashboard_charts(boolean) to authenticated;

-- Application-level audit events (exports, sends, config) written by the signed-in user
drop policy if exists audit_logs_insert on public.audit_logs;
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (public.is_member() and actor_id = auth.uid() and action in ('EXPORT','SEND','VERIFY','LOGIN','CONFIG'));

-- ===== supabase/migrations/20261122000003_storage_and_defaults.sql =====
-- =====================================================================
-- Storage bucket, default settings and system email templates
-- (System data only. Demo data lives in supabase/seed_demo.sql and is
--  flagged is_demo = true.)
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments read" on storage.objects;
drop policy if exists "attachments write" on storage.objects;
drop policy if exists "attachments delete" on storage.objects;
create policy "attachments read" on storage.objects for select to authenticated
  using (bucket_id = 'attachments' and public.is_member());
create policy "attachments write" on storage.objects for insert to authenticated
  with check (bucket_id = 'attachments' and public.can_write());
create policy "attachments delete" on storage.objects for delete to authenticated
  using (bucket_id = 'attachments' and public.is_manager());

-- ---------------------------------------------------------------------
-- Default application settings
-- ---------------------------------------------------------------------
insert into public.application_settings (key, value) values
('company', jsonb_build_object(
  'name', 'KAYA INTERIORS PRIVATE LIMITED',
  'website', 'https://www.kayainteriors.in',
  'logo_url', null,
  'address', '',
  'introduction', 'Kaya Interiors Private Limited is an interior contracting company delivering turnkey interior execution, commercial fit-outs, civil finishing, furniture manufacturing and installation across India.',
  'services', jsonb_build_array('Turnkey interior execution','Commercial interior fit-outs','Civil finishing','Furniture manufacturing & installation','Modular furniture','Carpentry & joinery','Flooring','False ceilings','Partitions','Painting','Electrical works'),
  'target_markets', jsonb_build_array('West India','North India'),
  'preferred_categories', jsonb_build_array('Corporate offices','Commercial office interiors','IT parks','Retail stores','Showrooms','Hospitals','Hotels','Banks','Co-working spaces')
)),
('lead_generation', jsonb_build_object(
  'preferred_states', jsonb_build_array('Maharashtra','Gujarat','Goa','Delhi','Haryana','Uttar Pradesh','Rajasthan','Punjab','Chandigarh'),
  'preferred_cities', jsonb_build_array('Mumbai','Thane','Navi Mumbai','Pune','Ahmedabad','Surat','Gurugram','Noida','Delhi'),
  'project_sizes', jsonb_build_array('10k_25k','25k_50k','50k_100k','gt_100k'),
  'max_queries_per_job', 24,
  'max_pages_per_query', 4,
  'monthly_api_budget_usd', 50
)),
('scoring_weights', jsonb_build_object(
  'confirmed_project', 25, 'confirmed_interior_requirement', 20, 'decision_maker', 15,
  'verified_contact', 15, 'priority_region', 10, 'external_contractor_potential', 10, 'execution_readiness', 5
)),
('automation', jsonb_build_object(
  'enabled', false,
  'daily', jsonb_build_object('discover_projects', true, 'discover_tenders', true, 'max_jobs', 2),
  'weekly', jsonb_build_object('refresh_hot_leads', true, 'deadline_check', true, 'report', true),
  'monthly', jsonb_build_object('performance_report', true, 'inactive_leads', true),
  'geography', jsonb_build_object('region', 'west', 'states', jsonb_build_array(), 'cities', jsonb_build_array('Mumbai','Pune','Gurugram')),
  'categories', jsonb_build_array('Corporate offices','Commercial office interiors','Hospitals','Hotels','Retail stores'),
  'queries_per_run', 12,
  'notify_roles', jsonb_build_array('administrator','bd_manager')
)),
('search_providers', jsonb_build_object('order', jsonb_build_array('serper')))
on conflict (key) do nothing;

-- ---------------------------------------------------------------------
-- System email templates (placeholders are filled from real records;
-- unfilled placeholders block sending)
-- ---------------------------------------------------------------------
insert into public.email_templates (slug, name, category, subject, body, is_system) values
('company_introduction', 'Company introduction', 'introduction',
 'Interior contracting partner for {{project_name}}',
 E'Dear {{contact_name}},\n\nI am writing from Kaya Interiors Private Limited. {{company_introduction}}\n\nWe understand that {{company_name}} is progressing {{project_name}} in {{city}}. We would welcome the opportunity to support the interior execution package — civil finishing, ceilings and partitions, flooring, joinery and furniture — under a single accountable contractor.\n\nWould you be open to a short call to understand the scope and timelines?\n\nWarm regards,\n{{sender_name}}\n{{sender_designation}}\nKaya Interiors Private Limited\n{{sender_phone}} | {{kaya_website}}', true),
('empanelment', 'Interior contractor empanelment', 'empanelment',
 'Request for empanelment – Kaya Interiors (interior contracting)',
 E'Dear {{contact_name}},\n\nKaya Interiors Private Limited would like to be considered for empanelment as an interior contractor with {{company_name}}.\n\n{{company_introduction}}\n\nPlease let us know the empanelment process and the documents you require. We will submit our company profile, statutory documents and project references promptly.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}} | {{kaya_website}}', true),
('project_enquiry', 'Request for project enquiry', 'enquiry',
 'Enquiry: interior works for {{project_name}}',
 E'Dear {{contact_name}},\n\nWe noted the announcement regarding {{project_name}} in {{city}}. Kaya Interiors would like to participate in the interior works package when it is ready for tender or enquiry.\n\nCould you advise whether the interior contractor selection has started, and who we should coordinate with?\n\nThank you,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('request_boq', 'Request for BOQ and drawings', 'boq',
 'Request for BOQ and drawings – {{project_name}}',
 E'Dear {{contact_name}},\n\nThank you for the discussion on {{project_name}}. To prepare an accurate quotation, could you share the BOQ, GFC/tender drawings, specifications and the expected timeline?\n\nWe will revert with queries, if any, within two working days of receipt.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('intro_follow_up', 'Follow-up after introduction', 'follow_up',
 'Following up – Kaya Interiors for {{project_name}}',
 E'Dear {{contact_name}},\n\nI am following up on my earlier note regarding interior execution support for {{project_name}}. If the timing is not right, I would be grateful if you could point me to the right colleague or a better time to reconnect.\n\nBest regards,\n{{sender_name}}\n{{sender_phone}}', true),
('quotation_submission', 'Quotation submission', 'quotation',
 'Quotation for interior works – {{project_name}}',
 E'Dear {{contact_name}},\n\nPlease find attached our quotation for the interior works at {{project_name}}, prepared against the BOQ and drawings shared.\n\nWe are available to walk you through the rates, specifications and execution plan at your convenience.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('quotation_follow_up', 'Quotation follow-up', 'quotation',
 'Follow-up on our quotation – {{project_name}}',
 E'Dear {{contact_name}},\n\nI wanted to check whether you had a chance to review our quotation for {{project_name}}. We are happy to clarify any item, discuss value-engineering options or meet for a technical review.\n\nRegards,\n{{sender_name}}\n{{sender_phone}}', true),
('meeting_request', 'Meeting request', 'meeting',
 'Request for a meeting – interior execution for {{project_name}}',
 E'Dear {{contact_name}},\n\nWould you be available for a 30-minute meeting in the coming week to discuss the interior scope for {{project_name}}? We can meet at your office in {{city}} or connect online, whichever suits you.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}}', true),
('vendor_registration', 'Vendor registration', 'vendor',
 'Vendor registration – Kaya Interiors Private Limited',
 E'Dear {{contact_name}},\n\nKaya Interiors Private Limited would like to register as a vendor with {{company_name}} for interior fit-out, civil finishing and furniture works.\n\nKindly share the vendor registration link or form and the list of required documents.\n\nThank you,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}} | {{kaya_website}}', true),
('capability_presentation', 'Project capability presentation', 'presentation',
 'Kaya Interiors – capability presentation',
 E'Dear {{contact_name}},\n\nAs discussed, I am sharing Kaya Interiors'' capability presentation covering our services, execution approach and in-house furniture manufacturing.\n\n{{company_introduction}}\n\nWe would value the opportunity to present it to your team in person.\n\nRegards,\n{{sender_name}}\n{{sender_designation}}\n{{sender_phone}} | {{kaya_website}}', true)
on conflict (slug) do nothing;

-- ===== supabase/migrations/20261122000004_views.sql =====
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

-- ===== Fix: profiles for users created before this setup =====
insert into public.profiles (id, email, full_name, role)
select u.id, u.email, coalesce(u.raw_user_meta_data->>'full_name', split_part(u.email, '@', 1)), 'administrator'
from auth.users u left join public.profiles p on p.id = u.id where p.id is null;

select email, role, is_active from public.profiles;
