// Map a free-text designation to a decision-maker role group.
const RULES: [string, RegExp][] = [
  ["procurement", /(procure|purchas|sourcing|vendor dev|supply chain|contracts? (head|manager)|buyer)/i],
  ["corporate_facilities", /(facilit|admin(istration)?\b|workplace|real estate|corporate services|estates?\b|infrastructure head)/i],
  ["design", /(architect|design (head|director|manager)|head of design|interior design|creative director)/i],
  ["pmc_contracting", /(design ?& ?build|business development|operations director|contracts manager|pmc)/i],
  ["project_management", /(project|construction|execution|site head|engineering head|delivery)/i],
  ["leadership", /(ceo|chief executive|founder|managing director|\bmd\b|director|president|coo|cfo|partner|owner)/i],
];
export function roleGroupFor(designation?: string | null): string | null {
  if (!designation) return null;
  for (const [g, r] of RULES) if (r.test(designation)) return g;
  return "other";
}
