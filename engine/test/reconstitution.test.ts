import { describe, expect, test } from "vitest";
import {
  checkReconstitutedDose,
  InvalidDateError,
  NO_ADDED_VOLUME_ASSUMPTION,
  reconstitute,
  U100_SYRINGE_STATEMENT,
  UNIT_CONFUSION_STATEMENT,
  VIAL_DISCARD_STATEMENT,
  vialDiscardDate,
} from "../src/flags/reconstitution.ts";
import type { ReconstitutionInput } from "../src/flags/reconstitution.ts";
import { InvalidDoseInputError } from "../src/flags/units.ts";

const FIVE_MG_IN_TWO_ML: ReconstitutionInput = { vialAmount: 5, vialUnit: "mg", diluentMl: 2 };

describe("reconstitute", () => {
  test("5 mg in 2 mL is 2.5 mg per mL, and the result states the no added volume assumption", () => {
    const result = reconstitute(FIVE_MG_IN_TWO_ML);

    expect(result.concentrationMgPerMl).toBeCloseTo(2.5, 10);
    expect(result.vialMg).toBe(5);
    expect(result.assumption).toBe(NO_ADDED_VOLUME_ASSUMPTION);
    expect(result.assumption).toContain("assumes the powder adds no volume");
  });

  test("a vial amount in mcg is converted to mg first", () => {
    const result = reconstitute({ vialAmount: 5000, vialUnit: "mcg", diluentMl: 2 });

    expect(result.vialMg).toBeCloseTo(5, 10);
    expect(result.concentrationMgPerMl).toBeCloseTo(2.5, 10);
  });

  test("rejects a zero or negative vial amount or liquid amount", () => {
    expect(() => reconstitute({ vialAmount: 0, vialUnit: "mg", diluentMl: 2 })).toThrow(InvalidDoseInputError);
    expect(() => reconstitute({ vialAmount: 5, vialUnit: "mg", diluentMl: -1 })).toThrow(InvalidDoseInputError);
    expect(() => reconstitute({ vialAmount: Number.NaN, vialUnit: "mcg", diluentMl: 2 })).toThrow(InvalidDoseInputError);
  });
});

describe("checkReconstitutedDose", () => {
  test("250 mcg from 5 mg in 2 mL is 0.1 mL, which is 10 units, with no flag", () => {
    const check = checkReconstitutedDose({ itemId: "vial", vial: FIVE_MG_IN_TWO_ML, dose: { value: 250, unit: "mcg" } });

    expect(check.dose.mg).toBeCloseTo(0.25, 10);
    expect(check.dose.mL).toBeCloseTo(0.1, 10);
    expect(check.dose.u100Units).toBeCloseTo(10, 10);
    expect(check.flags).toEqual([]);
  });

  test("the FDA example holds: 0.25 mg at 5 mg per mL is 0.05 mL, which is 5 units", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: { vialAmount: 5, vialUnit: "mg", diluentMl: 1 },
      dose: { value: 0.25, unit: "mg" },
    });

    expect(check.dose.mL).toBeCloseTo(0.05, 10);
    expect(check.dose.u100Units).toBeCloseTo(5, 10);
    expect(check.flags).toEqual([]);
  });

  test("a dose that needs more than one full 1 mL syringe is a stop flag that cites the FDA", () => {
    const check = checkReconstitutedDose({ itemId: "vial", vial: FIVE_MG_IN_TWO_ML, dose: { value: 3, unit: "mg" } });

    expect(check.dose.mL).toBeCloseTo(1.2, 10);
    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]).toMatchObject({ type: "dose_volume", severity: "stop", itemIds: ["vial"] });
    expect(check.flags[0]?.source).toBe(U100_SYRINGE_STATEMENT);
    expect(check.flags[0]?.numbers?.["doseU100Units"]).toBeCloseTo(120, 10);
    expect(check.flags[0]?.detail).not.toContain("more than the whole vial holds");
  });

  test("a dose typed in mg that was meant in mcg is caught as larger than the syringe and the whole vial", () => {
    const check = checkReconstitutedDose({ itemId: "vial", vial: FIVE_MG_IN_TWO_ML, dose: { value: 250, unit: "mg" } });

    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]?.severity).toBe("stop");
    expect(check.flags[0]?.detail).toContain("The dose is also more than the whole vial holds.");
  });

  test("exactly one full syringe is not flagged", () => {
    const check = checkReconstitutedDose({ itemId: "vial", vial: FIVE_MG_IN_TWO_ML, dose: { value: 2.5, unit: "mg" } });

    expect(check.dose.mL).toBeCloseTo(1, 10);
    expect(check.flags).toEqual([]);
  });

  test("a dose under 1 unit is flagged as too small to measure", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: { vialAmount: 10, vialUnit: "mg", diluentMl: 1 },
      dose: { value: 50, unit: "mcg" },
    });

    expect(check.dose.u100Units).toBeCloseTo(0.5, 10);
    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]).toMatchObject({ type: "dose_volume", severity: "ask" });
    expect(check.flags[0]?.title).toContain("too small to measure");
    expect(check.flags[0]?.source).toBe(U100_SYRINGE_STATEMENT);
  });

  test("the same figure given in mg and in mcg is flagged as a 1000 times mix-up", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: FIVE_MG_IN_TWO_ML,
      dose: { value: 0.25, unit: "mg" },
      alsoStated: { value: 0.25, unit: "mcg" },
    });

    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]).toMatchObject({ type: "unit_mismatch", severity: "stop", itemIds: ["vial"] });
    expect(check.flags[0]?.numbers?.["factor"]).toBeCloseTo(0.001, 10);
    expect(check.flags[0]?.detail).toContain("0.25 mg (250 mcg) and 0.25 mcg");
    expect(check.flags[0]?.detail).toContain("A gap of 1000 times is what happens when mg and mcg are swapped.");
    expect(check.flags[0]?.source).toBe(UNIT_CONFUSION_STATEMENT);
  });

  test("a dose given in mg and in mcg that agree raises no flag", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: FIVE_MG_IN_TWO_ML,
      dose: { value: 0.25, unit: "mg" },
      alsoStated: { value: 250, unit: "mcg" },
    });

    expect(check.flags).toEqual([]);
  });

  test("a single stated form is never guessed to be a mix-up", () => {
    const check = checkReconstitutedDose({ itemId: "vial", vial: FIVE_MG_IN_TWO_ML, dose: { value: 0.25, unit: "mcg" } });

    expect(check.flags.filter((flag) => flag.type === "unit_mismatch")).toEqual([]);
  });

  test("two forms that disagree by another amount are flagged without the mix-up sentence", () => {
    const check = checkReconstitutedDose({
      itemId: "vial",
      vial: FIVE_MG_IN_TWO_ML,
      dose: { value: 0.25, unit: "mg" },
      alsoStated: { value: 500, unit: "mcg" },
    });

    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]?.detail).toContain("They differ by 2 times.");
    expect(check.flags[0]?.detail).not.toContain("swapped");
  });

  test("rejects a zero dose", () => {
    expect(() => checkReconstitutedDose({ itemId: "vial", vial: FIVE_MG_IN_TWO_ML, dose: { value: 0, unit: "mcg" } })).toThrow(
      InvalidDoseInputError,
    );
  });
});

describe("vialDiscardDate", () => {
  test("the discard date is 28 days after first use and cites the FDA line", () => {
    const result = vialDiscardDate("2026-11-21");

    expect(result.discardBy).toBe("2026-12-19");
    expect(result.days).toBe(28);
    expect(result.source).toBe(VIAL_DISCARD_STATEMENT);
    expect(result.source.text).toContain("be used within 28 days after the first use");
  });

  test("the count crosses a leap day and a year end correctly", () => {
    expect(vialDiscardDate("2028-02-10").discardBy).toBe("2028-03-09");
    expect(vialDiscardDate("2026-12-20").discardBy).toBe("2027-01-17");
  });

  test("rejects text that is not a real calendar date", () => {
    expect(() => vialDiscardDate("11/21/2026")).toThrow(InvalidDateError);
    expect(() => vialDiscardDate("2026-02-30")).toThrow(InvalidDateError);
  });
});
