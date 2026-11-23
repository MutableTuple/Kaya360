import { route } from "@/lib/api";
import { calendarToken } from "@/lib/calendarToken";
import { env } from "@/lib/env";

export const GET = route(async (_req, ctx) => ({ url: `${env.appUrl()}/api/calendar/${calendarToken(ctx.user.id)}.ics` }));
