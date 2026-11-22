import { describe, expect, test } from "vitest";
import type { CodeFound, CodeLookupResult } from "../src/types.ts";
import { offlineLookup } from "./offline.ts";

const TYLENOL_IMAGE =
  "https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid=015a6179-bacb-452d-b594-4de628ddc11d&name=tylenol-01.jpg";

function found(result: CodeLookupResult): CodeFound {
  if (result.status !== "found") throw new Error(`Expected a match, got: ${result.message}`);
  return result;
}

describe("findByCode", () => {
  test.each(["300931713018", "0300931713018", "00300931713018", "3 00931 71301 8"])(
    "resolves printed barcode %s to the same warfarin package",
    async (text) => {
      expect(await offlineLookup().lookup.findByCode(text)).toMatchObject({
        status: "found", products: [{ packageNdc: "0093-1713-01", matchedBy: "barcode" }],
      });
    },
  );

  test.each(["NDC 50580-590", "NDC: 50580 590", "50580 590", "50580–590"])(
    "preserves the printed NDC segments in %s",
    async (text) => {
      expect(await offlineLookup().lookup.findByCode(text)).toMatchObject({
        status: "found", tried: ["50580-590"], products: [{ productNdc: "50580-590", matchedBy: "ndc" }],
      });
    },
  );

  test.each(["000931720", "00093-1720"])("checks the unpadded warfarin product code for %s", async (text) => {
    expect(await offlineLookup().lookup.findByCode(text)).toMatchObject({
      status: "found", tried: ["00093-1720", "0093-1720"], products: [{ productNdc: "0093-1720" }],
    });
  });

  test("returns a checksum error for a bad GTIN and leaves names to name search", async () => {
    const { lookup, requested } = offlineLookup();
    expect(await lookup.findByCode("00300931713019")).toMatchObject({
      status: "not_found", reason: "invalid_checksum", message: expect.stringContaining("Scan it again"), tried: [],
    });
    expect(await lookup.findByCode("5-HTP 100 mg")).toBeNull();
    expect(requested()).toEqual([]);
  });
});

describe("findByNdc", () => {
  test("finds the product for a hyphenated product code with everything a confirmation card needs", async () => {
    const result = found(await offlineLookup().lookup.findByNdc("50580-590"));

    expect(result.products).toEqual([
      {
        source: "openfda",
        kind: "otc",
        displayName: "TYLENOL Extra Strength",
        maker: "Kenvue Brands LLC",
        genericName: "acetaminophen",
        form: "TABLET, FILM COATED",
        route: "ORAL",
        productNdc: "50580-590",
        splSetId: "015a6179-bacb-452d-b594-4de628ddc11d",
        ingredients: [{ rawName: "ACETAMINOPHEN", value: 500, unit: "mg", per: { value: 1, unit: "each" }, strengthText: "500 mg/1" }],
        labelImages: [TYLENOL_IMAGE],
        recordUrl: "https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=015a6179-bacb-452d-b594-4de628ddc11d",
        matchedBy: "ndc",
        confidenceNote: "Exact match on drug code 50580-590.",
      },
    ]);
    expect(result.sourceErrors).toEqual([]);
  });

  test("finds the package for a code typed as printed on the box", async () => {
    const [product] = found(await offlineLookup().lookup.findByNdc("50580-590-05")).products;

    expect(product).toMatchObject({ packageNdc: "50580-590-05", confidenceNote: "Exact match on drug code 50580-590-05." });
  });

  test("finds the product for 8 bare digits", async () => {
    const result = found(await offlineLookup().lookup.findByNdc("50580590"));

    expect(result.tried).toEqual(["5058-0590", "50580-590"]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ productNdc: "50580-590", confidenceNote: "Drug code read as 50580-590." });
  });

  test("finds the package for an 11-digit billing code", async () => {
    const [product] = found(await offlineLookup().lookup.findByNdc("NDC 50580-0590-05")).products;

    expect(product).toMatchObject({
      productNdc: "50580-590",
      packageNdc: "50580-590-05",
      packageDescription: "1 BOTTLE in 1 CARTON (50580-590-05)  / 100 TABLET, FILM COATED in 1 BOTTLE",
      confidenceNote: "Drug code read as 50580-590-05.",
      labelImages: [TYLENOL_IMAGE],
    });
  });

  test("finds the package for bare digits by trying every hyphen position", async () => {
    const result = found(await offlineLookup().lookup.findByNdc("5058059005"));

    expect(result.tried).toEqual(["5058-0590-05", "50580-590-05", "50580-5900-5"]);
    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({ displayName: "TYLENOL Extra Strength", packageNdc: "50580-590-05", matchedBy: "ndc" });
  });

  test("reports no match for a well-formed code that has no record", async () => {
    const result = await offlineLookup().lookup.findByNdc("1234598765");

    expect(result).toEqual({
      status: "not_found",
      reason: "no_match",
      message: "No drug record has the code 1234-5987-65 or 12345-987-65 or 12345-9876-5. Check the digits or search by name.",
      tried: ["1234-5987-65", "12345-987-65", "12345-9876-5"],
    });
  });

  test("reports an unrecognised code without any request", async () => {
    const { lookup, requested } = offlineLookup();
    const result = await lookup.findByNdc("12-34");

    expect(result).toMatchObject({ status: "not_found", reason: "unrecognised_code" });
    expect(requested()).toEqual([]);
  });
});

describe("findByBarcode", () => {
  test("decodes 0300931713018 to package 0093-1713-01", async () => {
    const [product] = found(await offlineLookup().lookup.findByBarcode("0300931713018")).products;

    expect(product).toMatchObject({
      kind: "rx",
      displayName: "Warfarin Sodium",
      maker: "Teva Pharmaceuticals USA, Inc.",
      form: "TABLET",
      productNdc: "0093-1713",
      packageNdc: "0093-1713-01",
      upc: "300931713018",
      matchedBy: "barcode",
      confidenceNote: "The barcode decodes to package code 0093-1713-01.",
      ingredients: [{ rawName: "WARFARIN SODIUM", value: 2, unit: "mg", per: { value: 1, unit: "each" } }],
    });
    expect(product?.labelImages).toHaveLength(10);
  });

  test("decodes 0385096301300 to package 85096-301-30 and puts package photos first", async () => {
    const [product] = found(await offlineLookup().lookup.findByBarcode("0385096301300")).products;

    expect(product).toMatchObject({ displayName: "MENTHOL 5%", maker: "Marcella Health", packageNdc: "85096-301-30", kind: "otc" });
    expect(product?.ingredients).toMatchObject([{ rawName: "MENTHOL, (+)-", value: 500, unit: "mg", per: { value: 10, unit: "g" } }]);
    expect(product?.labelImages.map((url) => new URL(url).searchParams.get("name"))).toEqual([
      "Menthol 5 Box.jpg",
      "Menthol 5 Pouch.jpg",
    ]);
  });

  test("decodes 0335916016617 to package 35916-0166-1", async () => {
    const [product] = found(await offlineLookup().lookup.findByBarcode("0335916016617")).products;

    expect(product).toMatchObject({ productNdc: "35916-0166", packageNdc: "35916-0166-1", form: "CAPSULE, LIQUID FILLED" });
    expect(product?.ingredients.map((ingredient) => `${ingredient.rawName} ${ingredient.value} ${ingredient.unit}`)).toEqual([
      "PHENYLEPHRINE HYDROCHLORIDE 5 mg",
      "DEXTROMETHORPHAN HYDROBROMIDE 10 mg",
      "ACETAMINOPHEN 325 mg",
      "GUAIFENESIN 200 mg",
    ]);
  });

  test("accepts the same barcode as 12 digits or with spaces", async () => {
    const { lookup } = offlineLookup();
    const padded = found(await lookup.findByBarcode("0300931713018"));

    expect(found(await lookup.findByBarcode("300931713018")).products).toEqual(padded.products);
    expect(found(await lookup.findByBarcode("3 00931 71301 8")).products).toEqual(padded.products);
  });

  test("finds a store-brand drug through the barcode listed on its label", async () => {
    const result = found(await offlineLookup().lookup.findByBarcode("614299799868"));

    expect(result.products).toHaveLength(1);
    expect(result.products[0]).toMatchObject({
      displayName: "Sleep Aid",
      maker: "ARMY AND AIR FORCE EXCHANGE SERVICE",
      productNdc: "55301-986",
      upc: "614299799868",
      confidenceNote: "This barcode is listed on the label of this product.",
      ingredients: [{ rawName: "DOXYLAMINE SUCCINATE", value: 25, unit: "mg" }],
    });
    expect(result.products[0]?.packageNdc).toBeUndefined();
  });

  test("warns when a placeholder barcode is shared by unrelated labels", async () => {
    const result = found(await offlineLookup().lookup.findByBarcode("012345678905"));

    expect(result.products).toHaveLength(5);
    expect(new Set(result.products.map((product) => product.maker)).size).toBe(5);
    expect(result.products.every((product) => product.confidenceNote.includes("cannot identify one product"))).toBe(true);
  });

  test("finds a supplement through DSLD when no drug has the barcode", async () => {
    const { lookup, requested } = offlineLookup();
    const result = found(await lookup.findByBarcode("033984019560"));

    expect(result.products).toEqual([
      {
        source: "dsld",
        kind: "supplement",
        displayName: "Melatonin 10 mg",
        maker: "Solgar",
        form: "Tablet or Pill",
        dsldId: "65690",
        upc: "033984019560",
        offMarket: false,
        ingredients: [{ rawName: "Melatonin", value: 10, unit: "mg", per: { value: 1, unit: "Tablet(s)" } }],
        labelImages: ["https://api.ods.od.nih.gov/dsld/s3/pdf/65690.pdf"],
        recordUrl: "https://dsld.od.nih.gov/label/65690",
        matchedBy: "barcode",
        confidenceNote: "The barcode matches this label in the NIH supplement label database.",
      },
    ]);
    expect(requested()).toContain("https://api.ods.od.nih.gov/dsld/v9/search-filter?q=%220%2033984%2001956%200%22&size=10");
  });

  test("returns a clear not-found result for a barcode with no record anywhere", async () => {
    const { lookup, requested } = offlineLookup();
    const result = await lookup.findByBarcode("312345987657");

    expect(result).toEqual({
      status: "not_found",
      reason: "no_match",
      message: "No official record has this barcode. Search by name instead.",
      tried: ["1234-5987-65", "12345-987-65", "12345-9876-5", "0312345987657", '"3 12345 98765 7"'],
    });
    expect(requested()).toHaveLength(3);
  });

  test("rejects a mistyped barcode before any request", async () => {
    const { lookup, requested } = offlineLookup();
    const result = await lookup.findByBarcode("300931713019");

    expect(result).toMatchObject({ status: "not_found", reason: "invalid_checksum", message: expect.stringContaining("Scan it again") });
    expect(requested()).toEqual([]);
  });
});
