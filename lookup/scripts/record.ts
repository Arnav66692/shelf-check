import { createLookup } from "../src/lookup.ts";
import type { Lookup } from "../src/lookup.ts";
import type { CodeLookupResult, IdentifiedProduct, NameSearchResult } from "../src/types.ts";
import { recordingFetch, requestCounts } from "./recordingFetch.ts";

const MEMBER_PREVIEW = 3;

function describeProduct(product: IdentifiedProduct): string {
  const ingredients = product.ingredients
    .map((item) => `${item.rawName} ${item.value ?? "?"} ${item.unit}${item.per ? `/${item.per.value} ${item.per.unit}` : ""}`)
    .join("; ");
  const code = product.packageNdc ?? product.productNdc ?? `dsld ${product.dsldId ?? "?"}`;
  return `${product.kind} | ${product.displayName} | ${product.maker} | ${product.form ?? "-"} | ${code} | ${ingredients} | images ${product.labelImages.length} | ${product.confidenceNote}`;
}

function printSearch(result: NameSearchResult): void {
  console.log(`  corrected=${result.correctedQuery ?? "-"} drugs=${result.drugMatchTotal} errors=${result.sourceErrors.length}`);
  result.groups.forEach((group) => {
    console.log(`  [${group.makerCount} makers, ${group.members.length} records] ${describeProduct(group.product)}`);
    group.members.slice(1, MEMBER_PREVIEW).forEach((member) => console.log(`      also ${member.displayName} | ${member.maker} | ${member.productNdc ?? member.dsldId ?? ""}`));
  });
}

function printCode(result: CodeLookupResult): void {
  if (result.status === "not_found") {
    console.log(`  not found (${result.reason}): ${result.message} tried=${result.tried.join(", ")}`);
    return;
  }
  result.products.forEach((product) => console.log(`  ${describeProduct(product)}`));
  result.sourceErrors.forEach((error) => console.log(`  source error: ${error.message}`));
}

type Scenario = (lookup: Lookup) => Promise<void>;

const search = (query: string): Scenario => async (lookup) => printSearch(await lookup.searchByName(query));
const ndc = (text: string): Scenario => async (lookup) => printCode(await lookup.findByNdc(text));
const barcode = (digits: string): Scenario => async (lookup) => printCode(await lookup.findByBarcode(digits));

const labelAndImages = (productNdc: string): Scenario => async (lookup) => {
  const result = await lookup.findByNdc(productNdc);
  if (result.status !== "found" || result.products[0] === undefined) throw new Error(`${productNdc} was not found`);
  const [product] = result.products;
  const label = await lookup.getLabel(product);
  console.log(`  label sections: ${label === null ? "none" : Object.keys(label).join(", ")}`);
  console.log(`  images: ${(await lookup.getLabelImages(product)).join(" ")}`);
  const { productNdc: _dropped, ...withoutCode } = product;
  const bySetId = await lookup.getLabel(withoutCode);
  console.log(`  label by set id: ${bySetId === null ? "none" : Object.keys(bySetId).length} sections`);
};

const SCENARIOS: Readonly<Record<string, Scenario>> = {
  "ndc-product": ndc("50580-590"),
  "ndc-package": ndc("50580-590-05"),
  "ndc-bare-product": ndc("50580590"),
  "ndc-billing": ndc("50580-0590-05"),
  "ndc-bare": ndc("5058059005"),
  "search-tylenol": search("tylenol extra strength"),
  "search-nyquil": search("nyquil"),
  "search-misspelled": search("acetaminophn"),
  "search-melatonin": search("melatonin"),
  "search-melatonin-strength": search("melatonin 10 mg tablet"),
  "search-approximate": search("ibuprofin pm"),
  "search-unknown": search("nyquill"),
  "barcode-teva": barcode("0300931713018"),
  "barcode-85096": barcode("0385096301300"),
  "barcode-35916": barcode("0335916016617"),
  "barcode-placeholder": barcode("012345678905"),
  "barcode-store-brand": barcode("614299799868"),
  "barcode-miss": barcode("312345987657"),
  "barcode-supplement": barcode("033984019560"),
  "label": labelAndImages("50580-590"),
};

const wanted = process.argv.slice(2);
const lookup = createLookup({ fetch: recordingFetch });
for (const name of wanted.length > 0 ? wanted : Object.keys(SCENARIOS)) {
  const scenario = SCENARIOS[name];
  if (scenario === undefined) throw new Error(`Unknown scenario ${name}. Known: ${Object.keys(SCENARIOS).join(", ")}`);
  console.log(`\n== ${name}`);
  await scenario(lookup);
}
console.log(`\nnetwork requests so far: ${JSON.stringify(requestCounts())}`);
