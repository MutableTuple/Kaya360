import { NextResponse, type NextRequest } from "next/server";
import { readCalendarToken } from "@/lib/calendarToken";
import { createAdminClient } from "@/lib/supabase/admin";

const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
const dt = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** iCalendar subscription feed (Google Calendar / Outlook “subscribe by URL”). Token is an HMAC of the user id. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const uid = readCalendarToken((await params).token);
  if (!uid) return NextResponse.json({ error: "Invalid calendar link" }, { status: 401 });
  const db = createAdminClient();
  const { data: prof } = await db.from("profiles").select("is_active").eq("id", uid).maybeSingle();
  if (!prof?.is_active) return NextResponse.json({ error: "Inactive user" }, { status: 403 });
  const { data } = await db.from("v_follow_ups").select("*").eq("assigned_to", uid).neq("status", "cancelled").gte("due_at", new Date(Date.now() - 30 * 86400000).toISOString()).order("due_at").limit(1000);
  const base = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Kaya Interiors//Project Intelligence 360//EN", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Kaya BD follow-ups"];
  for (const f of data ?? []) {
    const s = new Date(f.due_at); const e = new Date(s.getTime() + (f.duration_minutes ?? 30) * 60000);
    lines.push("BEGIN:VEVENT", `UID:${f.id}@kaya360`, `DTSTAMP:${dt(new Date())}`, `DTSTART:${dt(s)}`, `DTEND:${dt(e)}`,
      `SUMMARY:${esc(`${f.status === "done" ? "✓ " : ""}${f.title}`)}`,
      `DESCRIPTION:${esc([f.activity_type?.replace(/_/g, " "), f.lead_title, f.company_name, f.contact_name, f.notes, f.next_action ? `Next: ${f.next_action}` : null].filter(Boolean).join("\n"))}`,
      ...(f.lead_id ? [`URL:${base}/leads/${f.lead_id}`] : []), "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new NextResponse(lines.join("\r\n"), { headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "private, max-age=300" } });
}
