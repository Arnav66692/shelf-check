import { describe, expect, test } from "vitest";
import { checkInjectionDose, convertDose, InvalidDoseInputError } from "../src/flags/units.ts";

describe("convertDose", () => {
  test("0.25 mg from a 5 mg per mL vial is 0.05 mL, which is 5 units on a U-100 syringe", () => {
    const dose = convertDose(5, { value: 0.25, unit: "mg" });

    expect(dose.mg).toBeCloseTo(0.25, 10);
    expect(dose.mL).toBeCloseTo(0.05, 10);
    expect(dose.u100Units).toBeCloseTo(5, 10);
  });

  test("100 units on a U-100 syringe is 1 mL", () => {
    const dose = convertDose(2.5, { value: 100, unit: "units" });

    expect(dose.mL).toBeCloseTo(1, 10);
    expect(dose.mg).toBeCloseTo(2.5, 10);
  });

  test("a dose given in mL converts to mg and units", () => {
    const dose = convertDose(10, { value: 0.3, unit: "mL" });

    expect(dose.mg).toBeCloseTo(3, 10);
    expect(dose.u100Units).toBeCloseTo(30, 10);
  });

  test("rejects a zero concentration or a negative dose", () => {
    expect(() => convertDose(0, { value: 1, unit: "mg" })).toThrow(InvalidDoseInputError);
    expect(() => convertDose(5, { value: -1, unit: "mL" })).toThrow(InvalidDoseInputError);
    expect(() => convertDose(Number.NaN, { value: 1, unit: "mg" })).toThrow(InvalidDoseInputError);
  });
});

describe("checkInjectionDose", () => {
  test("0.25 mg stated together with 25 units at 5 mg per mL is flagged as five times too much", () => {
    const check = checkInjectionDose({
      itemId: "vial",
      concentrationMgPerMl: 5,
      prescribed: { value: 0.25, unit: "mg" },
      alsoStated: { value: 25, unit: "units" },
      syringe: "u100_insulin",
    });

    expect(check.drawTo.unit).toBe("units");
    expect(check.drawTo.value).toBeCloseTo(5, 10);
    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]).toMatchObject({ type: "unit_mismatch", severity: "stop", itemIds: ["vial"] });
    expect(check.flags[0]?.numbers?.["factor"]).toBeCloseTo(5, 10);
    expect(check.flags[0]?.numbers?.["prescribedU100Units"]).toBeCloseTo(5, 10);
    expect(check.flags[0]?.numbers?.["statedMg"]).toBeCloseTo(1.25, 10);
  });

  test.each([1, 2.5, 5, 10])(
    "FDA example at %d mg per mL: told to draw 5 units, drawing 50 units is ten times the dose",
    (concentrationMgPerMl) => {
      const check = checkInjectionDose({
        itemId: "vial",
        concentrationMgPerMl,
        prescribed: { value: 5, unit: "units" },
        alsoStated: { value: 50, unit: "units" },
        syringe: "u100_insulin",
      });

      expect(check.flags).toHaveLength(1);
      expect(check.flags[0]?.numbers?.["factor"]).toBeCloseTo(10, 10);
      expect(check.flags[0]?.numbers?.["statedMg"]).toBeCloseTo(10 * check.dose.mg, 10);
      expect(check.flags[0]?.detail).toContain("10 times more");
    },
  );

  test("an underdose is reported with how many times less it is", () => {
    const check = checkInjectionDose({
      itemId: "vial",
      concentrationMgPerMl: 5,
      prescribed: { value: 0.5, unit: "mg" },
      alsoStated: { value: 1, unit: "units" },
      syringe: "u100_insulin",
    });

    expect(check.flags[0]?.numbers?.["factor"]).toBeCloseTo(0.1, 10);
    expect(check.flags[0]?.detail).toContain("10 times less");
  });

  test("a consistent pair raises no flag", () => {
    const check = checkInjectionDose({
      itemId: "vial",
      concentrationMgPerMl: 5,
      prescribed: { value: 0.25, unit: "mg" },
      alsoStated: { value: 5, unit: "units" },
      syringe: "u100_insulin",
    });

    expect(check.flags).toEqual([]);
  });

  test("a dose in units with a mL syringe gives the mL mark and asks for a check", () => {
    const check = checkInjectionDose({
      itemId: "vial",
      concentrationMgPerMl: 5,
      prescribed: { value: 5, unit: "units" },
      syringe: "mL",
    });

    expect(check.drawTo.unit).toBe("mL");
    expect(check.drawTo.value).toBeCloseTo(0.05, 10);
    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]).toMatchObject({ type: "unit_mismatch", severity: "ask" });
  });
});
