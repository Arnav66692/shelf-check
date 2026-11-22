import { describe, expect, test } from "vitest";
import { hasValidCheckDigit, parseBarcode } from "../src/barcode.ts";
import { StrengthParseError } from "../src/errors.ts";
import { parseNdc } from "../src/ndc.ts";
import { parseQuery } from "../src/query.ts";
import { parseStrength } from "../src/strength.ts";

describe("parseStrength", () => {
  test("reads an amount per single unit", () => {
    expect(parseStrength("500 mg/1")).toEqual({ value: 500, unit: "mg", per: { value: 1, unit: "each" } });
  });

  test("reads an amount per volume", () => {
    expect(parseStrength("12.5 mg/5mL")).toEqual({ value: 12.5, unit: "mg", per: { value: 5, unit: "mL" } });
  });

  test("keeps the microgram unit as written", () => {
    expect(parseStrength("137 ug/1")).toEqual({ value: 137, unit: "ug", per: { value: 1, unit: "each" } });
  });

  test("reads a denominator that has a unit and no number", () => {
    expect(parseStrength("6 [hp_X]/mL")).toEqual({ value: 6, unit: "[hp_X]", per: { value: 1, unit: "mL" } });
  });

  test("reads a leading decimal point", () => {
    expect(parseStrength(".5 mg/1").value).toBe(0.5);
  });

  test("throws a typed error for text that is not a strength", () => {
    expect(() => parseStrength("as needed")).toThrow(StrengthParseError);
    expect(() => parseStrength("")).toThrow(StrengthParseError);
    expect(() => parseStrength("5 mg/0 mL")).toThrow(StrengthParseError);
  });
});

describe("parseNdc", () => {
  test("keeps a hyphenated product code", () => {
    expect(parseNdc("50580-590")).toEqual({ kind: "product", candidates: ["50580-590"] });
  });

  test("strips the NDC prefix and reads spaces as hyphens", () => {
    expect(parseNdc("NDC: 50580 590 05")).toEqual({ kind: "package", candidates: ["50580-590-05"] });
  });

  test("removes the padding zero from an 11-digit billing code", () => {
    expect(parseNdc("50580-0590-05")).toEqual({ kind: "package", candidates: ["50580-590-05", "50580-0590-5"] });
    expect(parseNdc("00093171301")).toEqual({ kind: "package", candidates: ["0093-1713-01", "00093-1713-1"] });
  });

  test("tries all three splits of 10 bare digits", () => {
    expect(parseNdc("5058059005")).toEqual({
      kind: "package",
      candidates: ["5058-0590-05", "50580-590-05", "50580-5900-5"],
    });
  });

  test("tries both splits of 8 bare digits", () => {
    expect(parseNdc("50580590")).toEqual({ kind: "product", candidates: ["5058-0590", "50580-590"] });
  });

  test("keeps the printed 5-4 code and tries each possible padding zero", () => {
    const expected = { kind: "product", candidates: ["00093-0123", "0093-0123", "00093-123"] };
    expect(parseNdc("00093-0123")).toEqual(expected);
    expect(parseNdc("000930123")).toEqual(expected);
  });

  test("rejects an 11-digit code with no padding zero", () => {
    expect(parseNdc("12345-6789-12").kind).toBe("invalid");
  });

  test("rejects letters, empty text and barcode-length input", () => {
    expect(parseNdc("tylenol").kind).toBe("invalid");
    expect(parseNdc("  ").kind).toBe("invalid");
    expect(parseNdc("300931713018")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("barcode") });
  });
});

describe("parseBarcode", () => {
  test("decodes the drug code candidates from a UPC-A that starts with 3", () => {
    expect(parseBarcode("300931713018")).toEqual({
      kind: "gtin",
      searchUpc: "0300931713018",
      upcA: "300931713018",
      ndcCandidates: ["0093-1713-01", "00931-713-01", "00931-7130-1"],
    });
  });

  test("treats a 13-digit code with a leading zero as the same UPC-A", () => {
    expect(parseBarcode("0300931713018")).toEqual(parseBarcode("300931713018"));
    expect(parseBarcode("00300931713018")).toEqual(parseBarcode("300931713018"));
  });

  test("gives no drug code candidates when the UPC-A does not start with 3", () => {
    expect(parseBarcode("033984019560")).toMatchObject({ searchUpc: "0033984019560", ndcCandidates: [] });
  });

  test("rejects a wrong check digit", () => {
    expect(hasValidCheckDigit("300931713018")).toBe(true);
    expect(hasValidCheckDigit("300931713019")).toBe(false);
    expect(parseBarcode("300931713019")).toMatchObject({ kind: "invalid", reason: expect.stringContaining("Scan it again") });
  });

  test("rejects letters and unsupported lengths", () => {
    expect(parseBarcode("abc").kind).toBe("invalid");
    expect(parseBarcode("12345678").kind).toBe("invalid");
    expect(parseBarcode("12345").kind).toBe("invalid");
  });
});

describe("parseQuery", () => {
  test("separates the name, the strength and the form", () => {
    expect(parseQuery("  Melatonin 10 mg  tablets ")).toEqual({
      text: "Melatonin 10 mg tablets",
      nameTokens: ["melatonin"],
      strength: { value: 10, unit: "mg" },
      forms: ["tablet"],
    });
  });

  test("keeps brand words and drops search operators", () => {
    expect(parseQuery("Children's Tylenol AND cold").nameTokens).toEqual(["children's", "tylenol", "cold"]);
  });

  test("reads a strength written without a space", () => {
    expect(parseQuery("acetaminophn 500mg").strength).toEqual({ value: 500, unit: "mg" });
  });
});
