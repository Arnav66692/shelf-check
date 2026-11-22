import { parseStrength } from "./sources/openfda.ts";
import type { NdcActiveIngredient, NdcProduct, OpenFdaClient } from "./sources/openfda.ts";
import type { RxNavClient } from "./sources/rxnav.ts";
import type { CabinetItem, DrugClass, Ingredient, ItemKind } from "./types.ts";

export const DEFAULT_CLASS_SOURCES: readonly string[] = ["ATC", "FDASPL"];
const CLASS_TYPES_USED: readonly string[] = ["ATC1-4", "EPC"];

const KIND_BY_PRODUCT_TYPE: Readonly<Record<string, ItemKind>> = {
  "HUMAN OTC DRUG": "otc",
  "HUMAN PRESCRIPTION DRUG": "rx",
};

export class ProductNotFoundError extends Error {
  constructor(productNdc: string) {
    super(`openFDA has no NDC record for product_ndc "${productNdc}".`);
    this.name = "ProductNotFoundError";
  }
}

export class UnknownProductTypeError extends Error {
  constructor(productNdc: string, productType: string | undefined) {
    super(`Cannot tell if ${productNdc} is OTC or prescription from product_type "${productType ?? "missing"}". Pass kind explicitly.`);
    this.name = "UnknownProductTypeError";
  }
}

export interface CabinetSources {
  readonly openFda: OpenFdaClient;
  readonly rxNav: RxNavClient;
  readonly classSources?: readonly string[];
}

export interface CabinetItemRequest {
  readonly id: string;
  readonly productNdc: string;
  readonly displayName?: string;
  readonly kind?: ItemKind;
}

export interface ResolvedIdentity {
  readonly name: string;
  readonly rxcui?: string;
  readonly classes: readonly DrugClass[];
}

export interface IdentitySources {
  readonly rxNav: RxNavClient;
  readonly classSources?: readonly string[];
}

async function firstKnownRxcui(candidateNames: readonly string[], rxNav: RxNavClient): Promise<string | null> {
  for (const name of candidateNames) {
    const rxcui = await rxNav.findRxcui(name);
    if (rxcui !== null) return rxcui;
  }
  return null;
}

export async function resolveIdentity(
  candidateNames: readonly string[],
  fallbackName: string,
  sources: IdentitySources,
): Promise<ResolvedIdentity> {
  const matchedRxcui = await firstKnownRxcui(candidateNames, sources.rxNav);
  if (matchedRxcui === null) return { name: fallbackName, classes: [] };
  const [base] = await sources.rxNav.getBaseIngredients(matchedRxcui);
  const rxcui = base?.rxcui ?? matchedRxcui;
  const classLists = await Promise.all(
    (sources.classSources ?? DEFAULT_CLASS_SOURCES).map((relaSource) => sources.rxNav.getClasses(rxcui, relaSource)),
  );
  const classes = classLists.flat().filter((drugClass) => CLASS_TYPES_USED.includes(drugClass.type));
  return { name: base?.name.toLowerCase() ?? fallbackName, rxcui, classes };
}

async function toIngredient(raw: NdcActiveIngredient, sources: CabinetSources): Promise<Ingredient> {
  const strength = parseStrength(raw.strength);
  const identity = await resolveIdentity([raw.name], raw.name.trim().toLowerCase(), sources);
  return {
    name: identity.name,
    value: strength.value,
    unit: strength.unit,
    per: strength.per,
    classes: identity.classes,
    ...(identity.rxcui === undefined ? {} : { rxcui: identity.rxcui }),
  };
}

function kindOf(product: NdcProduct, requested: ItemKind | undefined): ItemKind {
  const kind = requested ?? KIND_BY_PRODUCT_TYPE[product.productType ?? ""];
  if (kind === undefined) throw new UnknownProductTypeError(product.productNdc, product.productType);
  return kind;
}

export async function buildCabinetItem(request: CabinetItemRequest, sources: CabinetSources): Promise<CabinetItem> {
  const product = await sources.openFda.getNdcProduct(request.productNdc);
  if (product === null) throw new ProductNotFoundError(request.productNdc);
  const [label, ingredients] = await Promise.all([
    sources.openFda.getLabel(request.productNdc),
    Promise.all(product.activeIngredients.map((raw) => toIngredient(raw, sources))),
  ]);
  return {
    id: request.id,
    displayName: request.displayName ?? product.brandName ?? product.genericName ?? request.productNdc,
    productNdc: product.productNdc,
    kind: kindOf(product, request.kind),
    ingredients,
    verified: true,
    ...(label === null ? {} : { label }),
  };
}
