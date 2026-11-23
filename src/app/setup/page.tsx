import { AuthCard } from "@/components/AuthCard";

export const dynamic = "force-dynamic";
export default function SetupPage() {
  const checks: [string, boolean][] = [
    ["NEXT_PUBLIC_SUPABASE_URL", !!process.env.NEXT_PUBLIC_SUPABASE_URL], ["NEXT_PUBLIC_SUPABASE_ANON_KEY", !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY],
    ["SUPABASE_SERVICE_ROLE_KEY", !!process.env.SUPABASE_SERVICE_ROLE_KEY], ["APP_ENCRYPTION_KEY (32+ chars)", (process.env.APP_ENCRYPTION_KEY ?? "").length >= 32], ["CRON_SECRET", !!process.env.CRON_SECRET],
  ];
  return (
    <AuthCard title="Setup required" subtitle="The server is missing required configuration. See docs/DEPLOYMENT.md.">
      <ul className="space-y-1 text-sm">{checks.map(([k, ok]) => <li key={k} className="flex justify-between"><code className="text-xs">{k}</code><span className={ok ? "text-emerald-600" : "text-red-600"}>{ok ? "set" : "missing"}</span></li>)}</ul>
    </AuthCard>
  );
}
