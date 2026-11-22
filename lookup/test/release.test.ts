import { describe, expect, test } from "vitest";
import { dsldSearchUrl } from "../src/dsld.ts";
import { createLookup } from "../src/lookup.ts";
import { ndcNameSearchUrl } from "../src/openfda.ts";
import { parseQuery } from "../src/query.ts";
import { groupProducts } from "../src/ranking.ts";
import { createFixtureFetch } from "./fixtureFetch.ts";

function releaseLookup() {
  const fixtures = createFixtureFetch();
  const searches: string[] = [];
  const lookup = createLookup({
    env: {},
    fetch: async (url) => {
      const { host, searchParams } = new URL(url);
      if (host === "api.fda.gov") {
        const search = searchParams.get("search") ?? "";
        searches.push(search);
        const name = search.includes("acetaminophn") ? "acetaminophn" : "acetaminophen";
        return fixtures.fetch(ndcNameSearchUrl([name], 100));
      }
      if (host === "api.ods.od.nih.gov" && searchParams.has("q")) {
        const name = searchParams.get("q")?.includes("acetaminophn") ? "acetaminophn" : "acetaminophen";
        return fixtures.fetch(dsldSearchUrl(name, 25));
      }
      return fixtures.fetch(url);
    },
  });
  return { lookup, searches };
}

describe("extended-release name search", () => {
  test.each(["extended release", "extended-release", "extended‑release", "ER", "XR"])("checks the dosage form for %s", async (descriptor) => {
    const { lookup, searches } = releaseLookup();
    const result = await lookup.searchByName(`acetaminophen ${descriptor}`);

    expect(searches).toEqual(['finished:true AND (brand_name:(acetaminophen) generic_name:(acetaminophen)) AND dosage_form:"extended release"']);
    expect(result.sourceErrors).toEqual([]);
    const members = result.groups.flatMap((group) => group.members);
    expect(members).toContainEqual(expect.objectContaining({ productNdc: "53329-221", displayName: "Medline" }));
    expect(members.every((member) => member.form?.includes("EXTENDED RELEASE"))).toBe(true);
  });

  test("preserves the release constraint after a spelling correction", async () => {
    const { lookup, searches } = releaseLookup();
    const result = await lookup.searchByName("acetaminophn XR");

    expect(parseQuery(result.correctedQuery ?? "")).toMatchObject({ nameTokens: ["acetaminophen"], forms: ["extended release"] });
    expect(searches).toHaveLength(2);
    expect(searches.every((search) => search.includes('dosage_form:"extended release"'))).toBe(true);
    const members = result.groups.flatMap((group) => group.members);
    expect(members.map((member) => member.productNdc)).toContain("53329-221");
    expect(members.every((member) => member.form?.includes("EXTENDED RELEASE"))).toBe(true);
  });

  test("recognizes a supplement's release wording on its label and keeps it out of plain tablet groups", async () => {
    const fixtures = createFixtureFetch();
    const searches: string[] = [];
    const query = "melatonin XR 10 mg tablet";
    const lookup = createLookup({
      env: {},
      fetch: async (url) => {
        const { host, searchParams } = new URL(url);
        if (host === "api.fda.gov") return fixtures.fetch(ndcNameSearchUrl(["melatonin"], 100));
        if (host === "api.ods.od.nih.gov" && searchParams.has("q")) searches.push(url);
        if (url === dsldSearchUrl(query, 25)) return fixtures.fetch(dsldSearchUrl("nyquill", 25));
        return fixtures.fetch(url);
      },
    });
    const result = await lookup.searchByName(query, { limit: 1 });
    expect(searches).toEqual([dsldSearchUrl(query, 25), dsldSearchUrl("melatonin 10 mg tablet", 25)]);
    expect(result.sourceErrors).toEqual([]);
    const members = result.groups.flatMap(({ members }) => members);
    expect(members).toHaveLength(1);
    const released = members[0]!;
    expect(released).toMatchObject({ displayName: "Melatonin 10 mg Time Release", form: "Tablet or Pill", dsldId: "282949" });
    expect(fixtures.requested().filter((url) => url.includes("/label/"))).toHaveLength(1);

    const plain = { ...released, displayName: "Melatonin 10 mg", dsldId: "plain" };
    for (const name of ["Melatonin ER", "Melatonin XR", "Melatonin Extended Release", released.displayName]) {
      const groups = groupProducts([plain, { ...released, displayName: name }], parseQuery("melatonin"));
      expect(groups.map(({ group }) => group.members.length)).toEqual([1, 1]);
    }
  });
});
