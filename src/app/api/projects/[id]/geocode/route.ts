import { route, must, HttpError } from "@/lib/api";
import { WRITE_ROLES } from "@/lib/constants";
import { geocode } from "@/lib/integrations/geocode";

export const POST = route<{ id: string }>(async (_req, ctx, { id }) => {
  const p = must(await ctx.supabase.from("projects").select("full_address,locality,city,state,pin_code,country").eq("id", id).maybeSingle());
  const address = [p.full_address, p.locality, p.city, p.state, p.pin_code, p.country ?? "India"].filter(Boolean).join(", ");
  if (!p.city && !p.full_address) throw new HttpError(400, "Add an address or city before locating the project on the map.");
  const g = await geocode(address, ctx.user.id);
  if (!g) throw new HttpError(404, `No location found for “${address}”.`);
  const { error } = await ctx.supabase.from("projects").update({ latitude: g.lat, longitude: g.lng, geocode_source: `${g.source}:${g.precision}` }).eq("id", id);
  if (error) throw error;
  return { location: g };
}, { roles: WRITE_ROLES, limit: 30 });
