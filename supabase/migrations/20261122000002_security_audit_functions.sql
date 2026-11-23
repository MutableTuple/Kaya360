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
