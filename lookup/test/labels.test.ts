import { describe, expect, test } from "vitest";
import { rankLabelImages, toLabelMedia } from "../src/dailymed.ts";
import type { IdentifiedProduct } from "../src/types.ts";
import { readFixtureJson } from "./fixtureFetch.ts";
import { offlineLookup } from "./offline.ts";

const TYLENOL_SET_ID = "015a6179-bacb-452d-b594-4de628ddc11d";
const APADAZ_MEDIA_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/0590d4e5-7107-4015-a6a8-deac14265aa2/media.json";
const OXYCODONE_MEDIA_URL = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls/57bcc87b-a5fa-cfdd-e063-6294a90a154f/media.json";

async function tylenol(): Promise<IdentifiedProduct> {
  const result = await offlineLookup().lookup.findByNdc("50580-590");
  const product = result.status === "found" ? result.products[0] : undefined;
  if (product === undefined) throw new Error("The Tylenol fixture was not found.");
  return product;
}

function rankedNames(url: string, productNdc?: string): readonly string[] {
  const media = toLabelMedia({ url, status: 200, body: readFixtureJson(url) });
  return rankLabelImages(media, productNdc).map((imageUrl) => new URL(imageUrl).searchParams.get("name") ?? "");
}

describe("getLabel", () => {
  test("returns the label sections of a drug", async () => {
    const label = await offlineLookup().lookup.getLabel(await tylenol());

    expect(Object.keys(label ?? {})).toEqual([
      "active_ingredient",
      "purpose",
      "indications_and_usage",
      "warnings",
      "do_not_use",
      "ask_doctor",
      "ask_doctor_or_pharmacist",
      "stop_use",
      "dosage_and_administration",
      "inactive_ingredient",
    ]);
    expect(label?.active_ingredient?.[0]).toContain("Acetaminophen 500 mg");
    expect(label?.warnings?.[0]).toMatch(/liver warning/i);
  });

  test("falls back to the label set id when the product has no drug code", async () => {
    const { productNdc: _dropped, ...withoutCode } = await tylenol();
    const { lookup, requested } = offlineLookup();
    const label = await lookup.getLabel(withoutCode);

    expect(label?.purpose).toBeDefined();
    expect(requested()).toEqual([`https://api.fda.gov/drug/label.json?search=set_id%3A(%22${TYLENOL_SET_ID}%22)&limit=1`]);
  });

  test("returns null for a supplement, which has no drug label", async () => {
    const { lookup, requested } = offlineLookup();
    const result = await lookup.findByBarcode("033984019560");
    const supplement = result.status === "found" ? result.products[0] : undefined;
    if (supplement === undefined) throw new Error("The supplement fixture was not found.");
    const before = requested().length;

    expect(await lookup.getLabel(supplement)).toBeNull();
    expect(requested()).toHaveLength(before);
  });
});

describe("getLabelImages", () => {
  test("returns the DailyMed label picture of a drug", async () => {
    const images = await offlineLookup().lookup.getLabelImages(await tylenol());
    expect(images).toEqual([`https://dailymed.nlm.nih.gov/dailymed/image.cfm?setid=${TYLENOL_SET_ID}&name=tylenol-01.jpg`]);
  });

  test("returns the DSLD label PDF of a supplement without a request", async () => {
    const { lookup } = offlineLookup();
    const result = await lookup.searchByName("melatonin");
    const supplement = result.groups[0]?.product;
    if (supplement === undefined) throw new Error("The melatonin fixture was not found.");

    expect(await lookup.getLabelImages(supplement)).toEqual(["https://api.ods.od.nih.gov/dsld/s3/pdf/239571.pdf"]);
  });

  test("puts the picture named after this product first and structures and logos last", () => {
    expect(rankedNames(APADAZ_MEDIA_URL, "70040-0167")).toEqual([
      "70040-0167-1.jpg",
      "70040-0145-1.jpg",
      "70040-0189-1.jpg",
      "Benzhydrocodone hydrochloride.jpg",
      "apap.jpg",
      "logo.jpg",
    ]);
  });

  test("puts a picture named with a strength ahead of chemical structures", () => {
    expect(rankedNames(OXYCODONE_MEDIA_URL)).toEqual(["Oxy APAP 500ml.jpg", "Oxycodone str.jpg", "oxy-acetamino-str.jpg"]);
  });
});
