import { dsldBarcodeQuery, parseBarcode } from "./barcode.ts";
import { dsldSearchUrl, toSupplementPage } from "./dsld.ts";
import type { SupplementHit } from "./dsld.ts";
import type { LookupError } from "./errors.ts";
import { unique } from "./http.ts";
import { getLabelImages } from "./labels.ts";
import { parseNdc } from "./ndc.ts";
import { labelByUpcUrl, ndcByPackageUrl, ndcByProductUrl, toDrugProduct, toLabelRecords, toNdcPage } from "./openfda.ts";
import type { NdcRecord } from "./openfda.ts";
import { settle, supplementProduct } from "./search.ts";
import type { Sources } from "./search.ts";
import type { CodeLookupResult, IdentifiedProduct } from "./types.ts";

const CODE_PAGE_SIZE = 10;
const UPC_LABEL_LIMIT = 5;
const MAX_SHARED_UPC_PRODUCTS = 10;
const BARCODE_SUPPLEMENT_HITS = 10;
const MAX_SUPPLEMENT_CHECKS = 3;
const MAX_PRODUCTS_WITH_IMAGES = 3;
const AMBIGUOUS_NOTE = " The digits fit more than one drug code, check the name and strength.";
const BARCODE_MISS_MESSAGE = "No official record has this barcode. Search by name instead.";

function notFound(reason: "no_match" | "unrecognised_code", message: string, tried: readonly string[]): CodeLookupResult {
  return { status: "not_found", reason, message, tried };
}

async function withImages(sources: Sources, product: IdentifiedProduct, index: number) {
  if (product.source !== "openfda" || product.splSetId === undefined || index >= MAX_PRODUCTS_WITH_IMAGES) {
    return { product, errors: [] };
  }
  const images = await settle(getLabelImages(sources, product));
  return images.ok ? { product: { ...product, labelImages: images.value }, errors: [] } : { product, errors: [images.error] };
}

async function found(
  sources: Sources,
  products: readonly IdentifiedProduct[],
  tried: readonly string[],
  earlierErrors: readonly LookupError[] = [],
): Promise<CodeLookupResult> {
  const pictured = await Promise.all(products.map((product, index) => withImages(sources, product, index)));
  return {
    status: "found",
    products: pictured.map((entry) => entry.product),
    tried,
    sourceErrors: [...earlierErrors, ...pictured.flatMap((entry) => entry.errors)],
  };
}

function ambiguityNote(products: readonly IdentifiedProduct[]): readonly IdentifiedProduct[] {
  if (products.length < 2) return products;
  return products.map((product) => ({ ...product, confidenceNote: `${product.confidenceNote}${AMBIGUOUS_NOTE}` }));
}

function packageMatches(
  records: readonly NdcRecord[],
  candidates: readonly string[],
  describe: (packageNdc: string) => { readonly matchedBy: "ndc" | "barcode"; readonly confidenceNote: string; readonly upc?: string },
): readonly IdentifiedProduct[] {
  return ambiguityNote(
    records.flatMap((record) =>
      candidates
        .filter((candidate) => record.packages.some((item) => item.packageNdc === candidate))
        .map((packageNdc) => toDrugProduct(record, { ...describe(packageNdc), packageNdc })),
    ),
  );
}

export async function findByNdc(sources: Sources, text: string): Promise<CodeLookupResult> {
  const parsed = parseNdc(text);
  if (parsed.kind === "invalid") return notFound("unrecognised_code", parsed.reason, []);
  const { candidates } = parsed;
  const verb = candidates.length === 1 ? "Exact match on drug code" : "Drug code read as";
  const url = parsed.kind === "product" ? ndcByProductUrl(candidates, CODE_PAGE_SIZE) : ndcByPackageUrl(candidates, CODE_PAGE_SIZE);
  const { records } = toNdcPage(await sources.openfda(url));
  const products =
    parsed.kind === "product"
      ? ambiguityNote(
          records.map((record) => toDrugProduct(record, { matchedBy: "ndc", confidenceNote: `${verb} ${record.productNdc}.` })),
        )
      : packageMatches(records, candidates, (packageNdc) => ({ matchedBy: "ndc", confidenceNote: `${verb} ${packageNdc}.` }));
  if (products.length > 0) return found(sources, products, candidates);
  return notFound("no_match", `No drug record has the code ${candidates.join(" or ")}. Check the digits or search by name.`, candidates);
}

async function drugsByDecodedNdc(sources: Sources, candidates: readonly string[], upc: string): Promise<readonly IdentifiedProduct[]> {
  if (candidates.length === 0) return [];
  const { records } = toNdcPage(await sources.openfda(ndcByPackageUrl(candidates, CODE_PAGE_SIZE)));
  return packageMatches(records, candidates, (packageNdc) => ({
    matchedBy: "barcode",
    confidenceNote: `The barcode decodes to package code ${packageNdc}.`,
    upc,
  }));
}

function sharedBarcodeNote(labelCount: number, productCount: number): string {
  if (labelCount > 1) {
    return `This barcode appears on ${labelCount} or more different labels in the FDA data, so it cannot identify one product. Check the name, maker and strength.`;
  }
  return productCount > 1
    ? `This barcode is listed on a label that covers ${productCount} products. Check the strength and form.`
    : "This barcode is listed on the label of this product.";
}

async function drugsByListedUpc(sources: Sources, searchUpc: string, upc: string): Promise<readonly IdentifiedProduct[]> {
  const labels = toLabelRecords(await sources.openfda(labelByUpcUrl(searchUpc, UPC_LABEL_LIMIT)));
  const productNdcs = unique(labels.flatMap((label) => label.productNdcs)).slice(0, MAX_SHARED_UPC_PRODUCTS);
  if (productNdcs.length === 0) return [];
  const { records } = toNdcPage(await sources.openfda(ndcByProductUrl(productNdcs, MAX_SHARED_UPC_PRODUCTS)));
  const confidenceNote = sharedBarcodeNote(labels.length, records.length);
  return records.map((record) => toDrugProduct(record, { matchedBy: "barcode", confidenceNote, upc }));
}

async function findDrugByBarcode(sources: Sources, candidates: readonly string[], searchUpc: string, upc: string) {
  const decoded = await drugsByDecodedNdc(sources, candidates, upc);
  return decoded.length > 0 ? decoded : drugsByListedUpc(sources, searchUpc, upc);
}

function onMarketNewestFirst(left: SupplementHit, right: SupplementHit): number {
  return Number(left.offMarket) - Number(right.offMarket) || right.entryDate.localeCompare(left.entryDate);
}

async function firstSupplementWithUpc(sources: Sources, hits: readonly SupplementHit[], upcA: string): Promise<IdentifiedProduct | null> {
  const [hit, ...rest] = hits;
  if (hit === undefined) return null;
  const confidenceNote = "The barcode matches this label in the NIH supplement label database.";
  const product = await supplementProduct(sources, hit.id, { matchedBy: "barcode", confidenceNote });
  return product.upc === upcA ? product : firstSupplementWithUpc(sources, rest, upcA);
}

async function findSupplementByBarcode(sources: Sources, upcA: string): Promise<readonly IdentifiedProduct[]> {
  const page = toSupplementPage(await sources.dsld(dsldSearchUrl(dsldBarcodeQuery(upcA), BARCODE_SUPPLEMENT_HITS)));
  const hits = [...page.hits].sort(onMarketNewestFirst).slice(0, MAX_SUPPLEMENT_CHECKS);
  const product = await firstSupplementWithUpc(sources, hits, upcA);
  return product === null ? [] : [product];
}

export async function findByBarcode(sources: Sources, text: string): Promise<CodeLookupResult> {
  const parsed = parseBarcode(text);
  if (parsed.kind === "invalid") return notFound("unrecognised_code", parsed.reason, []);
  const { searchUpc, upcA, ndcCandidates } = parsed;
  const upc = upcA ?? searchUpc;
  const tried = [...ndcCandidates, searchUpc, ...(upcA === undefined ? [] : [dsldBarcodeQuery(upcA)])];

  const drugs = await settle(findDrugByBarcode(sources, ndcCandidates, searchUpc, upc));
  if (drugs.ok && drugs.value.length > 0) return found(sources, drugs.value, tried);
  const drugErrors = drugs.ok ? [] : [drugs.error];

  const supplements = upcA === undefined ? [] : await findSupplementByBarcode(sources, upcA);
  if (supplements.length > 0) return found(sources, supplements, tried, drugErrors);
  const [drugError] = drugErrors;
  if (drugError !== undefined) throw drugError;
  return notFound("no_match", BARCODE_MISS_MESSAGE, tried);
}
