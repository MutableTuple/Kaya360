import { describe, it, expect } from "vitest";
import { groundProject, groundTender, type ExtractedProject, type ExtractedTender } from "@/lib/discovery/extract";
import { quoteGrounded, emailGrounded, phoneGrounded, nameGrounded, groundClassification } from "@/lib/discovery/grounding";

const TEXT = `Acme Technologies leases 1.2 lakh sq ft office at BKC, Mumbai. The company has invited bids from interior contractors for the fit-out of floors 4 to 9, with work expected to begin in March 2027. Rahul Mehta, Head of Real Estate at Acme Technologies, said the office would house 1,500 employees. For vendor enquiries write to procurement@acmetech.in or call +91 22 4000 1234. The project is valued at ₹180 crore. Architect: Studio Lotus.`;

const base = (): ExtractedProject => ({
  name: "Acme Technologies BKC Office", client_company: "Acme Technologies", client_website: null, parent_organisation: null, category: "Corporate offices", description: null,
  state: "Maharashtra", city: "Mumbai", locality: "BKC", address: null, area_sqft: 120000, floors: 6, building_type: null, estimated_project_value_inr: 1.8e9,
  announcement_date: null, expected_completion: null, interior_commencement: "2027-03-01", current_stage: "tendering", contractor_appointment_status: "open",
  opportunity_class: "CONFIRMED_REQUIREMENT", evidence_quote: "The company has invited bids from interior contractors for the fit-out of floors 4 to 9",
  architect: "Studio Lotus", interior_designer: null, pmc: "Fake PMC Associates", design_and_build: null, general_contractor: null, existing_interior_contractor: null,
  req_civil_finishing: true, req_furniture: true, req_mep: null, req_flooring: null, req_ceiling_partition: true, req_carpentry_joinery: null, req_renovation: null,
  interior_execution_potential: null, outsourcing_potential: null, relevance_reason: null,
  contacts: [
    { name: "Rahul Mehta", designation: "Head of Real Estate", company: "Acme Technologies", email: "rahul.mehta@acmetech.in", phone: null, linkedin_url: null },
    { name: "Priya Invented", designation: "CPO", company: "Acme Technologies", email: "priya@acmetech.in", phone: null, linkedin_url: null },
  ], grounding_notes: [],
});

describe("anti-fabrication grounding", () => {
  it("keeps a grounded confirmed requirement", () => {
    const p = groundProject(TEXT, base())!;
    expect(p.opportunity_class).toBe("CONFIRMED_REQUIREMENT");
    expect(p.architect).toBe("Studio Lotus");
  });
  it("removes stakeholders not present in source", () => {
    expect(groundProject(TEXT, base())!.pmc).toBeNull();
  });
  it("never keeps a guessed email for a named person", () => {
    const p = groundProject(TEXT, base())!;
    const rahul = p.contacts.find((c) => c.name === "Rahul Mehta")!;
    expect(rahul.email).toBeNull(); // rahul.mehta@acmetech.in is not in the text
    expect(rahul.designation).toBe("Head of Real Estate");
  });
  it("drops people whose name is not in the source", () => {
    expect(groundProject(TEXT, base())!.contacts.map((c) => c.name)).toEqual(["Rahul Mehta"]);
  });
  it("downgrades when the evidence quote is fabricated", () => {
    const b = base(); b.evidence_quote = "Acme is urgently looking for an interior contractor in Mumbai right now";
    const p = groundProject(TEXT, b)!;
    expect(p.opportunity_class).toBe("UNVERIFIED_ANNOUNCEMENT");
    expect(p.evidence_quote).toBeNull();
  });
  it("downgrades CONFIRMED to POTENTIAL when the quote has no requirement words", () => {
    const notes: string[] = [];
    expect(groundClassification(TEXT, "CONFIRMED_REQUIREMENT", "the office would house 1,500 employees", notes)).toBe("POTENTIAL_OPPORTUNITY");
  });
  it("removes numbers and dates the source does not support", () => {
    const t = "Beta Corp announced a new office in Pune. Beta Corp will hire 300 people.";
    const b = base(); Object.assign(b, { name: "Beta Corp Pune office", client_company: "Beta Corp", city: "Pune", locality: null, architect: null, pmc: null, contacts: [], evidence_quote: "Beta Corp announced a new office in Pune", opportunity_class: "POTENTIAL_OPPORTUNITY" });
    const p = groundProject(t, b)!;
    expect(p.area_sqft).toBeNull(); expect(p.estimated_project_value_inr).toBeNull(); expect(p.interior_commencement).toBeNull();
  });
  it("rejects a project whose client and name are absent from the source", () => {
    const b = base(); b.client_company = "Ghost Ltd"; b.name = "Ghost Tower";
    expect(groundProject(TEXT, b)).toBeNull();
  });
  it("email, phone and name matchers", () => {
    expect(emailGrounded(TEXT, "procurement@acmetech.in")).toBe(true);
    expect(phoneGrounded(TEXT, "022-40001234")).toBe(true);
    expect(phoneGrounded(TEXT, "+91 98200 00000")).toBe(false);
    expect(nameGrounded("Mr. Rahul K. Mehta joined", "Rahul Mehta")).toBe(true);
    expect(quoteGrounded(TEXT, "invited bids from interior contractors for the fit-out of floors 4 to 9")).toBe(true);
  });
});

describe("tender grounding", () => {
  const T = "Office of the Executive Engineer, PWD Mumbai. Tender No. PWD/MUM/2026/118 — Interior works for administrative block. Last date of submission: 15-12-2026 15:00. EMD Rs. 2,50,000.";
  const t = (): ExtractedTender => ({ organisation: "PWD Mumbai", title: "Interior works for administrative block", reference_number: "PWD/MUM/2026/118", work_description: null, category: "Interior works", location: "Mumbai", state: "Maharashtra", city: "Mumbai", estimated_value_inr: null, emd_inr: 250000, publication_date: null, submission_deadline: "2026-12-15T15:00:00+05:30", eligibility: null, required_experience: null, document_url: null, submission_url: null, status: "active", evidence_quote: null, grounding_notes: [] });
  it("keeps printed reference and deadline", () => { const r = groundTender(T, t())!; expect(r.reference_number).toBe("PWD/MUM/2026/118"); expect(r.emd_inr).toBe(250000); });
  it("removes an invented reference number", () => { const x = t(); x.reference_number = "PWD/MUM/2026/999"; expect(groundTender(T, x)!.reference_number).toBeNull(); });
  it("never claims active status without a deadline", () => { const x = t(); x.submission_deadline = null; x.status = "active"; expect(groundTender(T, x)!.status).toBe("unknown"); });
});
