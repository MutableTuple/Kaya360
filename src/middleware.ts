import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";

const PUBLIC = [/^\/login/, /^\/forgot-password/, /^\/reset-password/, /^\/auth\//, /^\/setup/, /^\/api\//];

export async function middleware(req: NextRequest) {
  let res = NextResponse.next({ request: req });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL; const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anon) {
    if (req.nextUrl.pathname.startsWith("/setup") || req.nextUrl.pathname.startsWith("/api/")) return res;
    return NextResponse.redirect(new URL("/setup", req.url));
  }
  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll: () => req.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => req.cookies.set(name, value));
        res = NextResponse.next({ request: req });
        list.forEach(({ name, value, options }) => res.cookies.set(name, value, options));
      },
    },
  });
  const { data: { user } } = await supabase.auth.getUser();
  const isPublic = PUBLIC.some((r) => r.test(req.nextUrl.pathname));
  if (!user && !isPublic) {
    const to = new URL("/login", req.url);
    to.searchParams.set("next", req.nextUrl.pathname + req.nextUrl.search);
    return NextResponse.redirect(to);
  }
  if (user && req.nextUrl.pathname === "/login") return NextResponse.redirect(new URL("/", req.url));
  return res;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|svg|ico|webp)$).*)"] };
