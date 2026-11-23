import { describe, it, expect } from "vitest";
import { scoreLead, classify, DEFAULT_WEIGHTS } from "@/lib/scoring";

const now = new Date("2026-11-22T00:00:00Z");
describe("lead scoring", () => {
  it("awards nothing for missing information", () => {
    const r = scoreLead({}, [], {}, now);
    expect(r.score).toBe(0);
    expect(r.classification).toBe("low");
    expect(r.items).toHaveLength(7);
  });
  it("scores a fully evidenced West-India lead as hot (100)", () => {
    const r = scoreLead({ opportunity_class: "CONFIRMED_REQUIREMENT", current_stage: "tendering", primary_source_url: "https://x.in/a", city: "Pune", contractor_appointment_status: "open", interior_commencement: "2027-01-15" },
      [{ role_group: "procurement", designation: "Head of Procurement", email_verification_status: "verified" }], {}, now);
    expect(r.score).toBe(100); expect(r.classification).toBe("hot");
  });
  it("does not treat an unverified (not_checked) email as verified", () => {
    const r = scoreLead({ primary_source_url: "https://x" }, [{ role_group: "design", designation: "Principal Architect", email_verification_status: "not_checked", direct_email: "a@b.in" }], {}, now);
    expect(r.items.find((i) => i.key === "verified_contact")!.points).toBe(0);
    expect(r.items.find((i) => i.key === "decision_maker")!.points).toBe(15);
  });
  it("gives no stage credit for an unverified announcement", () => {
    const r = scoreLead({ opportunity_class: "UNVERIFIED_ANNOUNCEMENT", current_stage: "construction", primary_source_url: "https://x" }, [], {}, now);
    expect(r.items.find((i) => i.key === "confirmed_project")!.points).toBe(0);
  });
  it("gives no contractor-potential points when a contractor is already appointed or unknown", () => {
    for (const s of ["appointed", "unknown", null]) expect(scoreLead({ contractor_appointment_status: s }, [], {}, now).items.find((i) => i.key === "external_contractor_potential")!.points).toBe(0);
  });
  it("applies custom weights", () => {
    const r = scoreLead({ city: "Gurugram" }, [], { ...DEFAULT_WEIGHTS, priority_region: 20, confirmed_project: 15 }, now);
    expect(r.items.find((i) => i.key === "priority_region")!.points).toBe(20);
  });
  it("South India is not a priority region", () => {
    expect(scoreLead({ city: "Bengaluru" }, [], {}, now).score).toBe(0);
  });
  it("classifies thresholds", () => {
    expect([classify(80), classify(79), classify(60), classify(59), classify(40), classify(39)]).toEqual(["hot", "warm", "warm", "potential", "potential", "low"]);
  });
});
