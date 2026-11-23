import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { runAutomation } from "@/lib/automation";
import { errorResponse } from "@/lib/api";

export const maxDuration = 60;
export const dynamic = "force-dynamic";

/** Scheduled entry point. Vercel Cron sends `Authorization: Bearer $CRON_SECRET`. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ freq: string }> }) {
  const { freq } = await params;
  const secret = process.env.CRON_SECRET;
  const got = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!secret) return NextResponse.json({ error: "CRON_SECRET is not configured." }, { status: 503 });
  if (got.length !== secret.length || !timingSafeEqual(Buffer.from(got), Buffer.from(secret))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!["tick", "daily", "weekly", "monthly"].includes(freq)) return NextResponse.json({ error: "Unknown schedule" }, { status: 404 });
  try { return NextResponse.json({ ok: true, freq, summary: await runAutomation(freq as "tick") }); }
  catch (e) { return errorResponse(e); }
}
export const POST = GET;
