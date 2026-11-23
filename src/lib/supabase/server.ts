import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { env } from "../env";

/** Supabase client bound to the signed-in user's session (RLS enforced). */
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(env.supabaseUrl(), env.supabaseAnonKey(), {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (list) => {
        try { list.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* called from a Server Component */ }
      },
    },
  });
}
