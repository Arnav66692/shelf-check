import { expect, test } from "vitest";
import { dsldLabelUrl, toSupplementLabel, toSupplementProduct } from "../src/dsld.ts";
import { ndcNameSearchUrl, toDrugProduct, toNdcPage } from "../src/openfda.ts";
import { correctedQuery, parseQuery } from "../src/query.ts";
import { groupProducts, productCandidate, scoreCandidate } from "../src/ranking.ts";
import { readFixtureJson } from "./fixtureFetch.ts";

const match = { matchedBy: "name" as const, confidenceNote: "" };

function savedDrug(tokens: readonly string[], ndc: string) {
  const url = ndcNameSearchUrl(tokens, 100);
  const record = toNdcPage({ url, status: 200, body: readFixtureJson(url) }).records.find((row) => row.productNdc === ndc);
  if (!record) throw new Error(`Missing fixture for ${ndc}`);
  return toDrugProduct(record, match);
}

function savedSupplement(id: string) {
  const url = dsldLabelUrl(id);
  return toSupplementProduct(id, toSupplementLabel({ url, status: 200, body: readFixtureJson(url) }), match);
}

test("a leading decimal ranks a submilligram supplement above the tenfold strength", () => {
  expect(parseQuery("melatonin .5 mg").strength).toEqual({ value: 0.5, unit: "mg" });
  const products = [savedSupplement("239571"), savedSupplement("63397")];
  const [best] = groupProducts(products, parseQuery("melatonin .3 mg"));
  expect(best?.group.product.displayName).toBe("Melatonin 300 mcg");
});

test("equivalent concentrations score equally and a different denominator loses the strength match", () => {
  const candidate = productCandidate(savedDrug(["acetaminophen"], "68071-4860"));
  const score = (query: string) => scoreCandidate(candidate, parseQuery(query));
  const hit = score("acetaminophen 160 mg/5 mL");
  expect(score("acetaminophen 32 mg/mL")).toBe(hit);
  expect(score("acetaminophen 32 g per L")).toBe(hit);
  expect(score("acetaminophen 160 mg/mL")).toBeLessThan(hit);
  expect(score("acetaminophen 160 mg")).toBeLessThan(hit);

  const tablet = productCandidate(savedDrug(["acetaminophen"], "71205-322"));
  expect(scoreCandidate(tablet, parseQuery("acetaminophen 160 mg"))).toBeGreaterThan(
    scoreCandidate(tablet, parseQuery("acetaminophen 160 mg/5 mL")),
  );
});

test.each([
  "diphenhydramine 38 mg / ibuprofen 200 mg",
  "diphenhydramine/ibuprofen 38/200 mg",
  "diphenhydramine/ibuprofen 38 mg/200 mg",
  "38 mg diphenhydramine + 200 mg ibuprofen",
])("binds each named ingredient to its amount in %s", (text) => {
  const original = savedDrug(["diphenhydramine", "ibuprofen"], "29485-6533");
  const swapped = {
    ...original,
    ingredients: original.ingredients.map((row, index, rows) => ({ ...row, rawName: rows[1 - index]!.rawName })),
  };
  const query = parseQuery(text);
  expect(query.nameTokens).toEqual(["diphenhydramine", "ibuprofen"]);
  const [best] = groupProducts([swapped, original], query);
  expect(best?.group.product).toBe(original);
  const partial = { ...original, ingredients: original.ingredients.slice(0, 1) };
  expect(scoreCandidate(productCandidate(partial), query)).toBeLessThan(scoreCandidate(productCandidate(original), query));
});

test("spelling corrections retain the complete typed concentration", () => {
  const candidate = productCandidate(savedDrug(["acetaminophen"], "68071-4860"));
  const corrected = correctedQuery(parseQuery("acetaminophn160 mg/5 mL liquid"), ["acetaminophen"]);
  expect(corrected.text).toBe("acetaminophen160 mg/5 mL liquid");
  expect(corrected.nameTokens).toEqual(["acetaminophen"]);
  expect(scoreCandidate(candidate, corrected)).toBe(scoreCandidate(candidate, parseQuery("acetaminophen 32 mg/mL liquid")));
  expect(corrected.strength?.per).toEqual({ value: 5, unit: "ml" });
});

test("a combination liquid's shared volume applies to both listed amounts", () => {
  const candidate = productCandidate(savedDrug(["acetaminophen"], "55910-031"));
  const paired = parseQuery("acetaminophen/dextromethorphan 160/5 mg per 5 mL");
  const explicit = parseQuery("acetaminophen 160 mg/5 mL and dextromethorphan 5 mg/5 mL");
  expect(paired.strengths).toEqual(explicit.strengths);
  expect(paired.strengths?.map((amount) => amount.per)).toEqual([{ value: 5, unit: "ml" }, { value: 5, unit: "ml" }]);
  expect(scoreCandidate(candidate, paired)).toBeGreaterThan(
    scoreCandidate(candidate, parseQuery("acetaminophen/dextromethorphan 160/5 mg per mL")),
  );
});

test("adult products rank above infants' and children's versions unless the search names a child", () => {
  const candidate = (name: string) => ({ name, otherNames: "acetaminophen", amounts: [], penalty: 0 });
  const adult = candidate("TYLENOL Extra Strength");
  const infant = candidate("Infants TYLENOL");
  const child = candidate("Childrens TYLENOL");
  expect(scoreCandidate(adult, parseQuery("tylenol"))).toBeGreaterThan(scoreCandidate(infant, parseQuery("tylenol")));
  expect(scoreCandidate(adult, parseQuery("tylenol"))).toBeGreaterThan(scoreCandidate(child, parseQuery("tylenol")));
  expect(scoreCandidate(child, parseQuery("childrens tylenol"))).toBeGreaterThan(scoreCandidate(adult, parseQuery("childrens tylenol")));
});
