import { describe, expect, test } from "vitest";
import page from "../fixtures/supplement-barcode-candidates.json";
import { dsldBarcodeQuery } from "../src/barcode.ts";
import { dsldLabelUrl, dsldSearchUrl } from "../src/dsld.ts";
import { HttpStatusError } from "../src/errors.ts";
import { createLookup } from "../src/lookup.ts";
import { createFixtureFetch } from "./fixtureFetch.ts";

const UPC = "033984019560";
const searchUrl = dsldSearchUrl(dsldBarcodeQuery(UPC), 10);

function fixtureLookup(barcodePage = page, failedLabel?: string) {
  const fixtures = createFixtureFetch();
  const labelIds: string[] = [];
  const lookup = createLookup({
    env: {},
    fetch: async (url) => {
      if (url === searchUrl) return { status: 200, text: async () => JSON.stringify(barcodePage) };
      if (url.startsWith(dsldLabelUrl(""))) labelIds.push(url.slice(dsldLabelUrl("").length));
      if (failedLabel && url === dsldLabelUrl(failedLabel)) return { status: 503, text: async () => "Unavailable" };
      return fixtures.fetch(url);
    },
  });
  return { lookup, labelIds };
}

describe("supplement candidate verification", () => {
  test("verifies the indexed exact UPC before checking newer labels", async () => {
    const { lookup, labelIds } = fixtureLookup();
    expect(await lookup.findByBarcode(UPC)).toMatchObject({
      status: "found", products: [{ dsldId: "65690", upc: UPC }], sourceErrors: [],
    });
    expect(labelIds).toEqual(["65690"]);
  });

  test("confirms the fourth label after a stale indexed UPC and a failed detail", async () => {
    const hits = page.hits.map((hit) => ({
      ...hit, _source: { ...hit._source, upcSku: hit._id === "332395" ? UPC : "" },
    }));
    const { lookup, labelIds } = fixtureLookup({ ...page, hits }, "299064");
    expect(await lookup.findByBarcode(UPC)).toMatchObject({
      status: "found", products: [{ dsldId: "65690", upc: UPC }],
      sourceErrors: [{ source: "dsld", url: dsldLabelUrl("299064"), status: 503 }],
    });
    expect(labelIds).toEqual(["332395", "299064", "239571", "65690"]);
  });

  test("distinguishes a truncated barcode search from a verified miss", async () => {
    const hits = page.hits.slice(0, 3);
    const truncated = fixtureLookup({ ...page, hits });
    expect(await truncated.lookup.findByBarcode(UPC)).toMatchObject({ status: "not_found", reason: "incomplete_search" });
    expect(truncated.labelIds).toEqual(hits.map((hit) => hit._id));

    const exhausted = fixtureLookup({ hits, stats: { count: hits.length } });
    expect(await exhausted.lookup.findByBarcode(UPC)).toMatchObject({ status: "not_found", reason: "no_match" });
  });

  test("propagates an unverified label failure when no later label matches", async () => {
    const hits = page.hits.slice(0, 3);
    const { lookup, labelIds } = fixtureLookup({ hits, stats: { count: hits.length } }, "332395");
    await expect(lookup.findByBarcode(UPC)).rejects.toBeInstanceOf(HttpStatusError);
    expect(labelIds).toEqual(hits.map((hit) => hit._id));
  });

  test("includes successful name search labels and reports the failed sibling", async () => {
    const { lookup } = fixtureLookup(page, "239571");
    const result = await lookup.searchByName("melatonin");
    const supplements = result.groups.flatMap((group) => group.members).filter((member) => member.source === "dsld");
    expect(supplements.length).toBeGreaterThan(0);
    expect(supplements.map((product) => product.dsldId)).not.toContain("239571");
    expect(result.sourceErrors).toMatchObject([{ source: "dsld", url: dsldLabelUrl("239571"), status: 503 }]);
  });
});
