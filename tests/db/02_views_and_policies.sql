\set ON_ERROR_STOP 1
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000001', false);
-- restore the soft-deleted lead so views have data
update public.leads set deleted_at = null;
do $$ begin
  assert (select count(*) from public.v_leads where deleted_at is null) = 1, 'v_leads';
  assert (select company_name from public.v_leads limit 1) = 'Acme Realty Pvt Ltd', 'v_leads joins company';
  assert (select lead_score from public.v_projects limit 1) = 82, 'v_projects exposes lead score';
  assert (select project_count from public.v_companies where name like 'Acme%') = 1, 'v_companies counts';
end $$;
insert into public.tenders (organisation, title, submission_deadline, status) values ('PWD', 'Interior works', now() + interval '3 days', 'unknown');
do $$ begin assert (select deadline_status from public.v_tenders limit 1) = 'closing_soon', 'deadline status'; end $$;
-- users may write their own EXPORT audit events but not forge others
insert into public.audit_logs (table_name, action, actor_id) values ('leads','EXPORT','00000000-0000-0000-0000-000000000001');
do $$ begin
  begin
    insert into public.audit_logs (table_name, action, actor_id) values ('leads','DELETE','00000000-0000-0000-0000-000000000001');
    raise exception 'forged audit accepted';
  exception when insufficient_privilege then null; end;
end $$;
-- viewer cannot read views' underlying hidden tables differently
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003', false);
do $$ begin assert (select count(*) from public.v_leads) = 1, 'viewer reads via security invoker view'; end $$;
-- deactivated user loses access entirely
reset role;
select set_config('request.jwt.claim.sub','', false);
update public.profiles set is_active = false where email = 'viewer@kaya.test';
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-000000000003', false);
set role authenticated;
do $$ begin assert (select count(*) from public.v_leads) = 0, 'inactive user sees nothing'; end $$;
reset role;
select 'view tests ok';
