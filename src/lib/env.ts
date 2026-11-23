// Central access to environment variables, with readable errors.
function req(name: string): string {
  const v = process.env[name];
  if (!v) throw new ConfigError(`Missing environment variable ${name}. See docs/ENVIRONMENT.md.`);
  return v;
}
export class ConfigError extends Error { status = 503; }
export const env = {
  supabaseUrl: () => req("NEXT_PUBLIC_SUPABASE_URL"),
  supabaseAnonKey: () => req("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
  serviceRoleKey: () => req("SUPABASE_SERVICE_ROLE_KEY"),
  appUrl: () => process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  encryptionKey: () => process.env.APP_ENCRYPTION_KEY,
  cronSecret: () => process.env.CRON_SECRET,
  openaiModel: () => process.env.OPENAI_MODEL || "gpt-4o-mini",
  isSupabaseConfigured: () => !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
};
