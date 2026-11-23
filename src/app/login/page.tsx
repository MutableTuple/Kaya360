"use client";
import { Suspense, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AuthCard } from "@/components/AuthCard";
import { Spinner } from "@/components/ui";

function LoginForm() {
  const sp = useSearchParams(); const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState(sp.get("error"));
  const next = sp.get("next") ?? "/"; const safe = next.startsWith("/") && !next.startsWith("//") ? next : "/";
  return (
    <form className="space-y-3" onSubmit={async (e) => {
      e.preventDefault(); setBusy(true); setErr(null);
      const { error } = await createBrowserSupabase().auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) setErr(error.message === "Invalid login credentials" ? "Incorrect email or password." : error.message); else { router.replace(safe); router.refresh(); }
    }}>
      <div><label className="label">Work email</label><input className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
      <div><label className="label">Password</label><input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></div>
      {err && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}
      <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}Sign in</button>
      <div className="text-center text-sm"><Link className="text-navy-600 hover:underline" href="/forgot-password">Forgot password?</Link></div>
      <p className="text-center text-[11px] text-slate-400">Access is by invitation from your administrator.</p>
    </form>
  );
}
export default function LoginPage() { return <AuthCard title="Sign in"><Suspense><LoginForm /></Suspense></AuthCard>; }
