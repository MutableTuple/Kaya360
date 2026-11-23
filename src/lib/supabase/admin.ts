import "server-only";
import { createClient } from "@supabase/supabase-js";
import { env } from "../env";

/** Service-role client. Server-only: bypasses RLS. Use for cron, invitations and secrets. */
export function createAdminClient() {
  return createClient(env.supabaseUrl(), env.serviceRoleKey(), { auth: { persistSession: false, autoRefreshToken: false } });
}
