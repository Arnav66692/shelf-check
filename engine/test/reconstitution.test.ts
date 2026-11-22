import { describe, expect, test } from "vitest";
import {
  checkReconstitutedDose,
  InvalidDateError,
  UnverifiedDrawError,
  reconstitute,
  UNIT_CONFUSION_STATEMENT,
  vialDiscardDate,
} from "../src/flags/reconstitution.ts";
import { readOfficialFile } from "./support/officialPages.ts";
import type { ReconstitutionInput, ReconstitutedDoseInput } from "../src/flags/reconstitution.ts";
import { InvalidDoseInputError } from "../src/flags/units.ts";

const WR = {
  presentation: "egrifta-wr", vialAmount: 11.6, vialUnit: "mg", diluentMl: 1.3, diluent: "supplied-bacteriostatic-water-for-injection",
} as const;
const SV = {
  presentation: "egrifta-sv", vialAmount: 2, vialUnit: "mg", diluentMl: 0.5, diluent: "supplied-sterile-water-for-injection",
} as const;
const MIXED_AND_STORED = { event: "mixing", storedAsLabeled: true } as const;

function blockedFlags(input: ReconstitutedDoseInput) {
  try {
    checkReconstitutedDose(input);
  } catch (error) {
    if (error instanceof UnverifiedDrawError) return error.flags;
    throw error;
  }
  throw new Error("Expected the draw to be withheld.");
}

describe("reconstitute", () => {
  test("does not assume the added diluent is the final volume", () => {
    expect(reconstitute({ vialAmount: 5, vialUnit: "mg", diluentMl: 2 })).toBeUndefined();
    const result = reconstitute(WR);
    expect(result?.vialMg).toBe(11.6);
    expect(result?.concentrationMgPerMl).toBe(8);
    expect(result?.assumption).toContain("8 mg per mL");
  });

  test("a vial amount in mcg is converted to mg first", () => {
    const result = reconstitute({ ...WR, vialAmount: 11600, vialUnit: "mcg" });
    expect(result?.vialMg).toBe(11.6);
    expect(result?.concentrationMgPerMl).toBe(8);
  });

  test("rejects a zero or negative vial amount or liquid amount", () => {
    expect(() => reconstitute({ vialAmount: 0, vialUnit: "mg", diluentMl: 2 })).toThrow(InvalidDoseInputError);
    expect(() => reconstitute({ vialAmount: 5, vialUnit: "mg", diluentMl: -1 })).toThrow(InvalidDoseInputError);
    expect(() => reconstitute({ vialAmount: Number.NaN, vialUnit: "mcg", diluentMl: 2 })).toThrow(InvalidDoseInputError);
  });
});

describe("checkReconstitutedDose", () => {
  test("a labeled dose in mcg has the same converted volume as the dose in mg", () => {
    const check = checkReconstitutedDose({ itemId: "vial", vial: WR, dose: { value: 1280, unit: "mcg" } });

    expect(check?.dose.mg).toBe(1.28);
    expect(check?.dose.mL).toBe(0.16);
    expect(check?.dose).not.toHaveProperty("u100Units");
    expect(check?.flags).toEqual([]);
  });

  test("the FDA example alone cannot establish that an unidentified vial is 5 mg per mL", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: { vialAmount: 5, vialUnit: "mg", diluentMl: 1 },
      dose: { value: 0.25, unit: "mg" },
    });

    expect(check).toBeUndefined();
  });

  test("a dose larger than a full 1 mL syringe gets no target and cites the kit label", () => {
    const flags = blockedFlags({ itemId: "vial", vial: WR, dose: { value: 9.6, unit: "mg" } });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "dose_volume", severity: "ask", itemIds: ["vial"] });
    expect(flags[0]?.source?.text).toContain("One dose of EGRIFTA WR is 1.28 mg in 0.16 mL");
    expect(flags[0]?.numbers).toBeUndefined();
    expect(flags[0]?.detail).not.toContain("more than the whole vial holds");
  });

  test("a dose typed in mg that was meant in mcg is caught as larger than the whole vial", () => {
    expect(() => checkReconstitutedDose({ itemId: "vial", vial: WR, dose: { value: 250, unit: "mg" } }))
      .toThrow(/more than the whole vial holds/);
  });

  test("exactly one full syringe still needs a matching labeled dose", () => {
    expect(() => checkReconstitutedDose({ itemId: "vial", vial: WR, dose: { value: 8, unit: "mg" } }))
      .toThrow(/does not match the dose/);
  });

  test("a sub-unit dose gets no syringe target and retains the label warning", () => {
    const flags = blockedFlags({ itemId: "vial", vial: WR, dose: { value: 40, unit: "mcg" } });
    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "dose_volume", severity: "ask" });
    expect(flags[0]?.title).toContain("differs from the labeled dose");
    expect(flags[0]?.detail).not.toContain("U-100");
    expect(flags[0]?.source?.text).toContain("One dose of EGRIFTA WR is 1.28 mg in 0.16 mL");
  });

  test("the same figure given in mg and in mcg is flagged as a 1000 times mix-up", () => {
    const flags = blockedFlags({
      itemId: "vial",
      vial: WR,
      dose: { value: 0.25, unit: "mg" },
      alsoStated: { value: 0.25, unit: "mcg" },
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]).toMatchObject({ type: "unit_mismatch", severity: "stop", itemIds: ["vial"] });
    expect(flags[0]?.numbers?.["factor"]).toBeCloseTo(0.001, 10);
    expect(flags[0]?.detail).toContain("0.25 mg (250 mcg) and 0.25 mcg");
    expect(flags[0]?.detail).toContain("A gap of 1,000 times is what happens when mg and mcg are swapped.");
    expect(flags[0]?.source).toBe(UNIT_CONFUSION_STATEMENT);
  });

  test("a dose given in mg and in mcg that agree raises no flag", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: WR,
      dose: { value: 1.28, unit: "mg" },
      alsoStated: { value: 1280, unit: "mcg" },
    });

    expect(check?.flags).toEqual([]);
  });

  test("a single stated form is never guessed to be a mix-up", () => {
    const flags = blockedFlags({ itemId: "vial", vial: WR, dose: { value: 0.25, unit: "mcg" } });

    expect(flags.filter((flag) => flag.type === "unit_mismatch")).toEqual([]);
  });

  test("two forms that disagree by another amount are flagged without the mix-up sentence", () => {
    const flags = blockedFlags({
      itemId: "vial",
      vial: WR,
      dose: { value: 0.25, unit: "mg" },
      alsoStated: { value: 500, unit: "mcg" },
    });

    expect(flags).toHaveLength(1);
    expect(flags[0]?.detail).toContain("They differ by 2 times.");
    expect(flags[0]?.detail).not.toContain("swapped");
  });

  test("rejects a zero dose", () => {
    expect(() => checkReconstitutedDose({ itemId: "vial", vial: WR, dose: { value: 0, unit: "mcg" } })).toThrow(
      InvalidDoseInputError,
    );
  });
});

describe("vialDiscardDate", () => {
  test("the discard deadline cites the presentation's label", () => {
    const result = vialDiscardDate("2026-11-21", WR.presentation, MIXED_AND_STORED);
    expect(result?.discardBy).toBe("2026-11-28");
    expect(result?.days).toBe(7);
    expect(result?.source.text).toContain("7 days after mixing");
  });

  test("the count crosses a leap day and a year end correctly", () => {
    expect(vialDiscardDate("2028-02-24", WR.presentation, MIXED_AND_STORED)?.discardBy).toBe("2028-03-02");
    expect(vialDiscardDate("2026-12-28", WR.presentation, MIXED_AND_STORED)?.discardBy).toBe("2027-01-04");
  });

  test("rejects text that is not a real calendar date", () => {
    expect(() => vialDiscardDate("11/21/2026")).toThrow(InvalidDateError);
    expect(() => vialDiscardDate("2026-02-30")).toThrow(InvalidDateError);
  });
});

describe("presentation-specific label rules", () => {
  test("requires the diluent supplied with the matched kit and reports only labeled mass and volume", () => {
    for (const [vial, mass] of [[WR, 1.28], [SV, 1.4]] as const) {
      const check = (diluent: string) => checkReconstitutedDose({
        itemId: "tesamorelin", vial: { ...vial, diluent }, dose: { value: mass, unit: "mg" },
      });
      const waterType = vial.presentation === "egrifta-wr" ? "bacteriostatic-water-for-injection" : "sterile-water-for-injection";
      expect(check(waterType)).toBeUndefined();
      expect(check(`supplied-${waterType}`)?.dose).toEqual({ mg: mass, mL: vial.presentation === "egrifta-wr" ? 0.16 : 0.35 });
    }
    const unknown = vialDiscardDate("2026-11-01", SV.presentation, { event: "mixing", storedAsLabeled: false });
    expect(unknown).toBeNull();
  });

  test("preparation and storage statements match the saved SPL for each kit", () => {
    for (const vial of [WR, SV]) {
      const prepared = reconstitute(vial);
      const discarded = vialDiscardDate("2026-11-01", vial.presentation, MIXED_AND_STORED);
      if (!prepared || !discarded) throw new Error("Missing label rule.");
      const setId = new URL(prepared.source.sourceUrl).searchParams.get("setid");
      if (!setId) throw new Error("Missing SPL set ID.");
      const xml = readOfficialFile(`peptide-labels/dailymed-spl-${setId}.xml`);
      const spl = xml.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
      expect(spl).toContain(prepared.source.text);
      expect(spl).toContain(discarded.source.text);
      const unsupported = blockedFlags({ itemId: "tesamorelin", vial, dose: { value: 1, unit: "mg" } });
      expect(spl).toContain(unsupported[0]?.source?.text);
      expect(discarded.source.sourceUrl).toBe(prepared.source.sourceUrl);
      expect(xml).toContain(`<effectiveTime value="${prepared.source.pageDate.replaceAll("-", "")}"/>`);
    }
  });

  test("uses the Egrifta WR final concentration and withholds an unidentified or mismatched draw", () => {
    const prescribed = { value: 1.28, unit: "mg" } as const;
    const check = (vial: ReconstitutionInput) => checkReconstitutedDose({ itemId: "tesamorelin", vial, dose: prescribed });
    expect(check(WR)?.dose.mL).toBe(0.16);
    expect(check({ vialAmount: 11.6, vialUnit: "mg", diluentMl: 1.3 })).toBeUndefined();
    expect(check({ ...WR, presentation: "tirzepatide" })).toBeUndefined();
    expect(check({ ...WR, diluentMl: 1.2 })).toBeUndefined();
    expect(check({ ...WR, diluent: "supplied-sterile-water-for-injection" })).toBeUndefined();
    expect(check({ ...WR, vialAmount: 11 })).toBeUndefined();
    expect(checkReconstitutedDose({ itemId: "tesamorelin", vial: SV, dose: { value: 1.4, unit: "mg" } })?.dose.mL).toBe(0.35);
  });

  test("withholds a draw that exceeds the vial even below syringe capacity", () => {
    const overVial = { itemId: "vial", dose: { value: 2, unit: "mg" } } as const;
    expect(() => checkReconstitutedDose({ ...overVial, vial: { vialAmount: 1, vialUnit: "mg", diluentMl: 0.2 } }))
      .toThrow(/more than the whole vial holds/i);
    expect(() => checkReconstitutedDose({ ...overVial, dose: { value: 2.1, unit: "mg" }, vial: SV }))
      .toThrow(/more than the whole vial holds/i);
  });

  test("binds discard to the presentation, mixing event and labeled storage", () => {
    const date = "2026-11-01";
    const context = { event: "mixing", storedAsLabeled: true } as const;
    const wrDate = vialDiscardDate(date, WR.presentation, context);
    expect(wrDate?.discardBy).toBe("2026-11-08");
    expect(wrDate?.source.text).toContain("20°C to 25°C");
    expect(vialDiscardDate(date, SV.presentation, context)).toMatchObject({ timing: "immediate", discardBy: null });
    expect(vialDiscardDate(date)).toBeNull();
    expect(vialDiscardDate(date, "tirzepatide", context)).toBeNull();
    expect(vialDiscardDate(date, WR.presentation)).toBeNull();
    expect(vialDiscardDate(date, WR.presentation, { event: "first-use", storedAsLabeled: true })).toBeNull();
    expect(vialDiscardDate(date, WR.presentation, { event: "mixing", storedAsLabeled: false })).toBeNull();
  });
});
