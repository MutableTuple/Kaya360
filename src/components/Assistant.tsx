"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, X, Sparkles, Mail } from "lucide-react";
import { api, cn, Spinner, useToast, ErrorBox, ApiError } from "./ui";

type Msg = { role: "user" | "assistant"; content: string; proposals?: Record<string, unknown>[]; drafts?: Record<string, unknown>[]; tools?: { name: string }[] };
const EXAMPLES = ["Which leads need follow-up today?", "Show all hot leads without verified contacts", "Find 20 upcoming office interior projects in Mumbai", "Which companies have not responded to our introduction email?", "Find new tender opportunities for interior finishing", "Identify PMCs operating in Pune"];

export function Assistant({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]); const [input, setInput] = useState(""); const [busy, setBusy] = useState(false); const [err, setErr] = useState<ApiError | null>(null);
  const toast = useToast(); const router = useRouter(); const end = useRef<HTMLDivElement>(null);
  const send = async (text: string) => {
    if (!text.trim()) return;
    const next = [...msgs, { role: "user" as const, content: text.trim() }];
    setMsgs(next); setInput(""); setBusy(true); setErr(null);
    try {
      const r = await api<{ reply: string; proposals: Record<string, unknown>[]; drafts: Record<string, unknown>[]; tools: { name: string }[] }>("/api/assistant", { method: "POST", json: { messages: next.map(({ role, content }) => ({ role, content })) } });
      setMsgs([...next, { role: "assistant", content: r.reply, proposals: r.proposals, drafts: r.drafts, tools: r.tools }]);
    } catch (e) { setErr(e as ApiError); } finally { setBusy(false); setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth" }), 50); }
  };
  const start = async (p: Record<string, unknown>) => {
    const geography = (p.cities as string[] | undefined)?.length ? { scope: "cities", cities: p.cities } : (p.states as string[] | undefined)?.length ? { scope: "states", states: p.states } : { scope: (p.region as string) ?? "west" };
    try {
      if (p.kind === "decision_makers") { router.push(`/companies?q=${encodeURIComponent(String(p.company ?? ""))}`); toast("info", "Open the company and click Find decision makers."); return; }
      const r = await api<{ job: { id: string; status: string } }>("/api/discovery/jobs", { method: "POST", json: { kind: p.kind, geography, categories: p.categories ?? [], keywords: p.keywords ?? [], period: p.period ?? "90d", trigger: "assistant" } });
      toast(r.job.status === "running" ? "success" : "error", r.job.status === "running" ? "Research job started." : "Job created but integrations are missing — see the discovery page.");
      router.push(`/discovery?job=${r.job.id}`); onClose();
    } catch (e) { toast("error", (e as Error).message); }
  };
  if (!open) return null;
  return (
    <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-2xl">
      <div className="flex items-center gap-2 border-b px-4 py-3"><Bot className="h-5 w-5 text-navy-700" /><div className="flex-1"><div className="text-sm font-semibold">BD Assistant</div><div className="text-[11px] text-slate-500">Answers from your database · proposes web research for approval</div></div><button className="btn-ghost btn-xs" onClick={onClose} aria-label="Close"><X className="h-4 w-4" /></button></div>
      <div className="flex-1 space-y-3 overflow-y-auto p-4">
        {msgs.length === 0 && <div className="space-y-2"><p className="text-sm text-slate-600">Ask about your leads, follow-ups, companies or tenders. For new web research I&apos;ll propose a discovery job that you start.</p>{EXAMPLES.map((e) => <button key={e} className="block w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm hover:bg-navy-50" onClick={() => send(e)}>{e}</button>)}</div>}
        {msgs.map((m, i) => (
          <div key={i} className={cn("rounded-xl px-3 py-2 text-sm", m.role === "user" ? "ml-8 bg-navy-800 text-white" : "mr-4 bg-slate-100 text-slate-800")}>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.tools?.length ? <div className="mt-1 text-[10px] text-slate-500">Database tools used: {[...new Set(m.tools.map((t) => t.name))].join(", ")}</div> : null}
            {m.proposals?.map((p, j) => <div key={j} className="mt-2 rounded-lg border border-navy-200 bg-white p-2 text-xs text-slate-700"><div className="font-semibold text-navy-800">Proposed research: {String(p.kind)}</div><div>{[(p.cities as string[])?.join(", "), (p.states as string[])?.join(", "), p.region, (p.categories as string[])?.join(", "), (p.keywords as string[])?.join(", "), p.company].filter(Boolean).join(" · ")}</div><button className="btn-primary btn-xs mt-2" onClick={() => start(p)}><Sparkles className="h-3.5 w-3.5" />Start research</button></div>)}
            {m.drafts?.map((d, j) => <div key={j} className="mt-2 rounded-lg border border-slate-200 bg-white p-2 text-xs"><div className="font-semibold">Draft saved for {String(d.to)}</div><div className="text-slate-500">{String(d.subject)}</div>{(d.unfilled_placeholders as string[])?.length ? <div className="text-amber-700">Complete: {(d.unfilled_placeholders as string[]).join(", ")}</div> : null}<button className="btn-secondary btn-xs mt-1" onClick={() => { router.push(`/email?draft=${d.draft_id}`); onClose(); }}><Mail className="h-3.5 w-3.5" />Review & approve</button></div>)}
          </div>
        ))}
        {busy && <div className="flex items-center gap-2 text-sm text-slate-500"><Spinner />Querying database…</div>}
        {err && <ErrorBox error={err} />}
        <div ref={end} />
      </div>
      <form className="flex gap-2 border-t p-3" onSubmit={(e) => { e.preventDefault(); send(input); }}>
        <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask the assistant…" disabled={busy} />
        <button className="btn-primary" disabled={busy || !input.trim()} aria-label="Send"><Send className="h-4 w-4" /></button>
      </form>
    </div>
  );
}
