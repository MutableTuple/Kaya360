import { route } from "@/lib/api";
import { missingForDiscovery } from "@/lib/discovery/engine";

export const GET = route(async () => ({
  projects: await missingForDiscovery("projects"),
  tenders: await missingForDiscovery("tenders"),
  decision_makers: await missingForDiscovery("decision_makers"),
}));
