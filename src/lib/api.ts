import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { ZodError } from "zod";
import { createClient } from "./supabase/server";
import { ConfigError } from "./env";
import type { Role } from "./constants";
import { rateLimit } from "./ratelimit";

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) { super(message); }
}

export interface Ctx {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: { id: string; email: string };
  profile: { id: string; email: string; full_name: string | null; role: Role; is_active: boolean; designation: string | null; phone: string | null };
}

export async function getCtx(roles?: Role[]): Promise<Ctx> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new HttpError(401, "Your session has expired. Please sign in again.");
  const { data: profile, error } = await supabase.from("profiles").select("id,email,full_name,role,is_active,designation,phone").eq("id", user.id).single();
  if (error || !profile) throw new HttpError(403, "Your user profile was not found. Ask an administrator to invite you.");
  if (!profile.is_active) throw new HttpError(403, "Your account has been deactivated.");
  if (roles && !roles.includes(profile.role as Role)) throw new HttpError(403, `This action requires one of these roles: ${roles.join(", ")}.`);
  return { supabase, user: { id: user.id, email: user.email ?? profile.email }, profile: profile as Ctx["profile"] };
}

type Handler<P> = (req: NextRequest, ctx: Ctx, params: P) => Promise<unknown>;

/** Wrap an API route: auth, role check, rate limit, consistent JSON errors. */
export function route<P = Record<string, string>>(fn: Handler<P>, opts: { roles?: Role[]; limit?: number } = {}) {
  return async (req: NextRequest, context: { params: Promise<P> }) => {
    try {
      const ctx = await getCtx(opts.roles);
      const rl = rateLimit(`${ctx.user.id}:${req.nextUrl.pathname}`, opts.limit ?? 120);
      if (!rl.ok) throw new HttpError(429, `Too many requests. Try again in ${rl.retryAfter}s.`);
      const params = (await context?.params) ?? ({} as P);
      const out = await fn(req, ctx, params);
      if (out instanceof Response) return out;
      return NextResponse.json(out ?? { ok: true });
    } catch (e) {
      return errorResponse(e);
    }
  };
}

export function errorResponse(e: unknown) {
  if (e instanceof HttpError) return NextResponse.json({ error: e.message, details: e.details }, { status: e.status });
  if (e instanceof ConfigError) return NextResponse.json({ error: e.message, code: "missing_configuration" }, { status: 503 });
  if (e instanceof ZodError) {
    const msg = e.issues.map((i) => `${i.path.join(".") || "input"}: ${i.message}`).join("; ");
    return NextResponse.json({ error: `Please check the form — ${msg}` }, { status: 400 });
  }
  const pg = e as { code?: string; message?: string; details?: string };
  if (pg?.code === "23505") return NextResponse.json({ error: "A matching record already exists (duplicate detected).", details: pg.details }, { status: 409 });
  if (pg?.code === "42501") return NextResponse.json({ error: "You do not have permission to make this change." }, { status: 403 });
  if (pg?.code === "23514") return NextResponse.json({ error: `A value failed validation: ${pg.message}` }, { status: 400 });
  if (pg?.code === "23503") return NextResponse.json({ error: "This record is linked to another record that does not exist." }, { status: 400 });
  console.error("[api] unexpected error", e);
  return NextResponse.json({ error: pg?.message || "Unexpected server error." }, { status: 500 });
}

/** Throw on Supabase error, otherwise return data. */
export function must<T>(res: { data: T; error: unknown }): NonNullable<T> {
  if (res.error) throw res.error;
  if (res.data === null || res.data === undefined) throw new HttpError(404, "Record not found.");
  return res.data as NonNullable<T>;
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try { return (await req.json()) as T; } catch { throw new HttpError(400, "Request body must be valid JSON."); }
}

/** Strip control characters and trim string inputs (defence in depth; React escapes output). */
export function sanitize<T>(v: T): T {
  if (typeof v === "string") return v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim() as T;
  if (Array.isArray(v)) return v.map(sanitize) as T;
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sanitize(x)])) as T;
  return v;
}
