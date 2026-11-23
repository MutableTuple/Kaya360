-- Database behaviour tests. Any failed assertion raises and aborts the run.
\set ON_ERROR_STOP 1

-- Users: first becomes administrator, others viewers
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001','admin@kaya.test'),
  ('00000000-0000-0000-0000-000000000002','sales@kaya.test'),
  ('00000000-0000-0000-0000-000000000003','viewer@kaya.test');

do $$ begin
  assert (select role from public.profiles where email='admin@kaya.test') = 'administrator', 'first user should be admin';
  assert (select role from public.profiles where email='viewer@kaya.test') = 'viewer', 'later users default to viewer';
end $$;

-- Admin promotes sales user
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001', false);
update public.profiles set role='sales_executive' where email='sales@kaya.test';

-- Sales user cannot self-promote
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002', false);
do $$ begin
  begin
    update public.profiles set role='administrator' where id = auth.uid();
    raise exception 'self-promotion should have failed';
  exception when raise_exception then
    if sqlerrm = 'self-promotion should have failed' then raise; end if;
  end;
end $$;

-- Sales user creates company + project + lead
insert into public.companies (name, website, city, state) values ('Acme Realty Pvt Ltd', 'https://www.acmerealty.in/about', 'Mumbai', 'Maharashtra');
do $$ begin
  assert (select domain from public.companies where name='Acme Realty Pvt Ltd') = 'acmerealty.in', 'domain normalisation';
end $$;

-- Duplicate company (different suffix/case) is rejected
do $$ begin
  begin
    insert into public.companies (name) values ('ACME REALTY PRIVATE LIMITED');
    raise exception 'duplicate company accepted';
  exception when unique_violation then null; end;
end $$;

insert into public.projects (name, city, state, client_company_id, opportunity_class, primary_source_url)
select 'Acme Tower Corporate Office', 'Mumbai', 'Maharashtra', id, 'POTENTIAL_OPPORTUNITY', 'https://news.example/acme' from public.companies where name='Acme Realty Pvt Ltd';

do $$ begin
  begin
    insert into public.projects (name, city) values ('ACME Tower — Corporate Office', 'mumbai');
    raise exception 'duplicate project accepted';
  exception when unique_violation then null; end;
end $$;

insert into public.leads (project_id, company_id, score_auto, estimated_value, lead_source)
select p.id, p.client_company_id, 72, 12500000, 'manual' from public.projects p where p.name='Acme Tower Corporate Office';

do $$ begin
  assert (select priority from public.leads limit 1) = 'warm', 'priority from score';
end $$;

-- Manual adjustment without reason is rejected
do $$ begin
  begin
    update public.leads set score_adjustment = 10;
    raise exception 'adjustment without reason accepted';
  exception when check_violation then null; end;
end $$;
update public.leads set score_adjustment = 10, score_adjustment_reason = 'Met facilities head; confirmed scope';
do $$ begin
  assert (select score from public.leads limit 1) = 82, 'final score includes adjustment';
  assert (select priority from public.leads limit 1) = 'hot', 'reclassified as hot';
end $$;

-- Pipeline move logs activity
update public.leads set stage = 'intro_email_sent';
do $$ begin
  assert (select count(*) from public.lead_activities where kind='stage_change') = 1, 'stage change activity logged';
  assert (select count(*) from public.lead_activities where kind='score_change') = 1, 'score change activity logged';
end $$;

-- Viewer can read but not write
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003', false);
do $$ begin
  assert (select count(*) from public.leads) = 1, 'viewer can read leads';
  begin
    insert into public.companies (name) values ('Viewer Co');
    raise exception 'viewer insert accepted';
  exception when insufficient_privilege then null; end;
  update public.leads set notes = 'viewer edit';
  assert (select notes from public.leads limit 1) is null, 'viewer update silently filtered by RLS';
  assert (select count(*) from public.audit_logs) = 0, 'viewer cannot read audit logs';
  assert (select count(*) from public.integration_secrets) = 0, 'secrets hidden';
end $$;

-- Sales cannot hard delete; admin can read audit trail
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000002', false);
delete from public.leads;
do $$ begin assert (select count(*) from public.leads) = 1, 'sales hard delete blocked'; end $$;
update public.leads set deleted_at = now();

select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001', false);
do $$ begin
  assert (select count(*) from public.audit_logs where table_name='leads' and action='SOFT_DELETE') = 1, 'soft delete audited';
  assert (select count(*) from public.audit_logs where table_name='companies' and action='INSERT') >= 1, 'insert audited';
  assert (select actor_email from public.audit_logs where table_name='leads' and action='SOFT_DELETE') = 'sales@kaya.test', 'actor recorded';
end $$;

-- Dashboard functions run and ignore soft-deleted rows
do $$ declare s jsonb; c jsonb; begin
  s := public.dashboard_stats(true);
  assert (s->>'total_leads')::int = 0, 'soft deleted lead excluded';
  assert (s->>'total_projects')::int = 1, 'project counted';
  c := public.dashboard_charts(true);
  assert c ? 'by_state', 'charts payload';
end $$;

-- Admin cannot demote the last administrator
do $$ begin
  begin
    update public.profiles set role='viewer' where email='admin@kaya.test';
    raise exception 'last admin demoted';
  exception when raise_exception then
    if sqlerrm = 'last admin demoted' then raise; end if;
  end;
end $$;

-- Templates & settings seeded
do $$ begin
  assert (select count(*) from public.email_templates where is_system) = 10, '10 system templates';
  assert (select count(*) from public.application_settings) >= 5, 'settings seeded';
end $$;
reset role;
select 'db tests ok';
