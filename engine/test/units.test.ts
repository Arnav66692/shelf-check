import { describe, expect, test } from "vitest";
import draws from "../fixtures/injection-draws.json";
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
  test.each([
    ["over capacity", draws.overCapacity],
    ["below the first graduation", draws.belowGraduation],
    ["between graduations", draws.betweenMarks],
  ] as const)("withholds a vial draw %s and returns its volume flag", (_, example) => {
    const result = checkInjectionDose({
      itemId: "vial", concentrationMgPerMl: example.strengthMgPerMl,
      prescribed: { unit: "mg", value: example.doseMg }, syringe: "u100_insulin",
    });
    expect(result.dose.mL).toBeCloseTo(example.volumeMl);
    expect(result.flags).toMatchObject([{ type: "dose_volume", severity: "stop" }]);
    expect(result.drawTo).toBeNull();
  });

  test("uses the specified syringe capacity and graduation at both boundaries", () => {
    const check = (mL: number) => checkInjectionDose({
      itemId: "vial", concentrationMgPerMl: 5, syringe: "mL",
      syringeCapacityMl: 0.3, syringeGraduationMl: 0.005, prescribed: { unit: "mL", value: mL },
    });
    expect(check(0.3).drawTo).toEqual({ unit: "mL", value: 0.3 });
    expect(check(0.005).flags).toEqual([]);
    expect(check(0.305).drawTo).toBeNull();
    expect(check(0.004).drawTo).toBeNull();
  });

  test.each([draws.concentratedInsulin.unitsPerMl, 200, 300, null])(
    "withholds all conversions and marks for insulin at %s units per mL",
    (insulinUnitsPerMl) => {
      const result = checkInjectionDose({
        medication: "insulin", insulinUnitsPerMl, itemId: "insulin", syringe: "u100_insulin",
        prescribed: { value: draws.concentratedInsulin.prescribedUnits, unit: "units" },
      });
      expect(result).toMatchObject({ dose: null, drawTo: null, flags: [{ severity: "stop", type: "unit_mismatch" }] });
    },
  );

  test("returns only insulin units and volume for U-100 and suppresses unmeasurable marks", () => {
    const check = (units: number) => checkInjectionDose({
      medication: "insulin", insulinUnitsPerMl: draws.u100Insulin.unitsPerMl,
      itemId: "insulin", syringe: "u100_insulin", prescribed: { value: units, unit: "units" },
    });
    const result = check(draws.u100Insulin.prescribedUnits);
    expect(result.dose).toEqual({ insulinUnits: draws.u100Insulin.prescribedUnits, mL: draws.u100Insulin.volumeMl });
    expect(result.drawTo).toEqual({ value: draws.u100Insulin.prescribedUnits, unit: "units" });
    expect(check(101)).toMatchObject({ drawTo: null, flags: [{ type: "dose_volume", severity: "stop" }] });
    expect(check(0.5)).toMatchObject({ drawTo: null, flags: [{ type: "dose_volume", severity: "stop" }] });
  });

  test("0.25 mg stated together with 25 units at 5 mg per mL is flagged as five times too much", () => {
    const check = checkInjectionDose({
      itemId: "vial",
      concentrationMgPerMl: 5,
      prescribed: { value: 0.25, unit: "mg" },
      alsoStated: { value: 25, unit: "units" },
      syringe: "u100_insulin",
    });

    expect(check.drawTo).toBeNull();
    expect(check.dose.u100Units).toBeCloseTo(5, 10);
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

    expect(check.drawTo?.unit).toBe("mL");
    expect(check.drawTo?.value).toBeCloseTo(0.05, 10);
    expect(check.flags).toHaveLength(1);
    expect(check.flags[0]).toMatchObject({ type: "unit_mismatch", severity: "ask" });
  });
});
