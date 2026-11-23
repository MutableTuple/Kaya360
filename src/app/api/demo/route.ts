import { route } from "@/lib/api";
import { loadDemo, removeDemo } from "@/lib/demo";

export const POST = route(async (_req, ctx) => loadDemo(ctx.user.id), { roles: ["administrator"] });
export const DELETE = route(async () => removeDemo(), { roles: ["administrator"] });
