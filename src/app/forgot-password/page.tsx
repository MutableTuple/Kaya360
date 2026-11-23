"use client";
import { useState } from "react";
import Link from "next/link";
import { createBrowserSupabase } from "@/lib/supabase/browser";
import { AuthCard } from "@/components/AuthCard";
import { Spinner } from "@/components/ui";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <AuthCard
      title="Reset your password"
      subtitle="We will email you a secure reset link."
    >
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setErr(null);
          const { error } =
            await createBrowserSupabase().auth.resetPasswordForEmail(email, {
              redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
            });
          setBusy(false);
          if (error) setErr(error.message);
          else
            setMsg(
              "If an account exists for this email, a reset link has been sent.",
            );
        }}
      >
        <div>
          <label className="label">Work email</label>
          <input
            className="input"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>
        {msg && (
          <div className="rounded-lg bg-emerald-50 p-2 text-sm text-emerald-800">
            {msg}
          </div>
        )}
        {err && (
          <div className="rounded-lg bg-red-50 p-2 text-sm text-red-700">
            {err}
          </div>
        )}
        <button className="btn-primary w-full" disabled={busy}>
          {busy && <Spinner />}Send reset link
        </button>
        <div className="text-center text-sm">
          <Link className="text-navy-600 hover:underline" href="/login">
            Back to sign in
          </Link>
        </div>
      </form>
    </AuthCard>
  );
}
