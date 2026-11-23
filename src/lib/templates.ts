// Placeholder rendering for email templates. Unfilled placeholders are reported
// so the UI can block sending until the user completes them.
export const PLACEHOLDERS = ["contact_name", "company_name", "project_name", "city", "sender_name", "sender_designation", "sender_phone", "kaya_website", "company_introduction"] as const;

export function renderTemplate(text: string, vars: Record<string, string | null | undefined>) {
  const missing = new Set<string>();
  const out = text.replace(/\{\{\s*([a-z_]+)\s*\}\}/g, (m, k: string) => {
    const v = vars[k];
    if (v == null || String(v).trim() === "") { missing.add(k); return m; }
    return String(v);
  });
  return { text: out, missing: [...missing] };
}

export function unfilled(text: string) {
  return [...new Set([...text.matchAll(/\{\{\s*([a-z_]+)\s*\}\}/g)].map((m) => m[1]))];
}
