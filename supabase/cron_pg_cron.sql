-- OPTIONAL alternative to Vercel Cron: schedule the automation endpoints from
-- Supabase using pg_cron + pg_net. Enable both extensions in the dashboard
-- (Database → Extensions), replace the two placeholders, then run this once.

-- select vault.create_secret('YOUR_CRON_SECRET', 'kaya_cron_secret');

do $$
declare base text := 'https://YOUR-APP-DOMAIN';   -- NEXT_PUBLIC_APP_URL
begin
  perform cron.unschedule(jobname) from cron.job where jobname like 'kaya_%';
  perform cron.schedule('kaya_tick',   '*/10 * * * *', format($f$select net.http_get(url := %L, headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kaya_cron_secret')), timeout_milliseconds := 60000)$f$, base || '/api/cron/tick'));
  perform cron.schedule('kaya_daily',  '30 0 * * *',   format($f$select net.http_get(url := %L, headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kaya_cron_secret')), timeout_milliseconds := 60000)$f$, base || '/api/cron/daily'));
  perform cron.schedule('kaya_weekly', '0 1 * * 1',    format($f$select net.http_get(url := %L, headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kaya_cron_secret')), timeout_milliseconds := 60000)$f$, base || '/api/cron/weekly'));
  perform cron.schedule('kaya_monthly','0 2 1 * *',    format($f$select net.http_get(url := %L, headers := jsonb_build_object('Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='kaya_cron_secret')), timeout_milliseconds := 60000)$f$, base || '/api/cron/monthly'));
end $$;
