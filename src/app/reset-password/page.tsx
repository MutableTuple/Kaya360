"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AuthCard } from "@/components/AuthCard";
import { Spinner } from "@/components/ui";

export default function ResetPage() {
  const router = useRouter();
  const [pw, setPw] = useState(""); const [pw2, setPw2] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<string | null>(null);
  return (
    <AuthCard title="Set a new password" subtitle="Use at least 10 characters.">
      <form className="space-y-3" onSubmit={async (e) => {
        e.preventDefault(); setErr(null);
        if (pw.length < 10) return setErr("Password must be at least 10 characters.");
        if (pw !== pw2) return setErr("Passwords do not match.");
        setBusy(true);
        const { error } = await createBrowserSupabase().auth.updateUser({ password: pw });
        setBusy(false); if (error) setErr(error.message === "Auth session missing!" ? "This reset link has expired. Request a new one." : error.message); else router.replace("/");
      }}>
        <div><label className="label">New password</label><input className="input" type="password" autoComplete="new-password" required value={pw} onChange={(e) => setPw(e.target.value)} /></div>
        <div><label className="label">Confirm password</label><input className="input" type="password" autoComplete="new-password" required value={pw2} onChange={(e) => setPw2(e.target.value)} /></div>
        {err && <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">{err}</div>}
        <button className="btn-primary w-full" disabled={busy}>{busy && <Spinner />}Save password</button>
      </form>
    </AuthCard>
  );
}
