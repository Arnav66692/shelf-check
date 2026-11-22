import {
  buildCabinetItem,
  buildSupplementItem,
  checkCabinet,
  createDsldClient,
  createOpenFdaClient,
  createRxNavClient,
  type CabinetItem,
  type Flag as EngineFlag,
  type HealthProfile,
} from "@engine/index.ts";
import { peptideCabinetFlags, peptideCabinetItem } from "@engine/peptideCabinet.ts";
import { PEPTIDES, type PeptideId } from "@engine/peptides.ts";
import type { Flag, FlagQuote, Product, Profile } from "@/lib/model";
import sampleItems from "./sampleItems.json";

const openFda = createOpenFdaClient();
const rxNav = createRxNavClient();
const dsld = createDsldClient();
const builtItems = new Map<string, Promise<CabinetItem>>();

function isPeptideId(value: string): value is PeptideId {
  return Object.hasOwn(PEPTIDES, value);
}

function build(product: Product): Promise<CabinetItem> {
  if (product.peptideId) {
    if (!isPeptideId(product.peptideId)) return Promise.reject(new Error(`Unknown peptide "${product.peptideId}".`));
    return Promise.resolve(peptideCabinetItem({ id: product.id, peptideId: product.peptideId }));
  }
  if (product.dsldId) {
    return buildSupplementItem({ id: product.id, dsldId: product.dsldId, displayName: product.displayName }, { dsld, rxNav });
  }
  if (product.productNdc && product.kind !== "supplement") {
    return buildCabinetItem(
      { id: product.id, productNdc: product.productNdc, displayName: product.displayName, kind: product.kind },
      { openFda, rxNav },
    );
  }
  return Promise.reject(new Error(`"${product.displayName}" has no official record id to check.`));
}

const SAVED_SAMPLE_ITEMS = sampleItems as unknown as Readonly<Record<string, CabinetItem>>;

function identityOf(product: Product): string {
  if (product.peptideId) return `peptide:${product.peptideId}`;
  if (product.dsldId) return `dsld:${product.dsldId}`;
  return `${product.kind}:ndc:${product.productNdc ?? ""}`;
}

function savedSample(product: Product): CabinetItem | undefined {
  if (!Object.hasOwn(SAVED_SAMPLE_ITEMS, product.id)) return undefined;
  const saved = SAVED_SAMPLE_ITEMS[product.id];
  return saved.productNdc !== undefined && saved.productNdc === product.productNdc ? saved : undefined;
}

async function builtOnce(product: Product): Promise<CabinetItem> {
  const sample = savedSample(product);
  const base = sample
    ? sample
    : await (() => {
        const key = identityOf(product);
        const existing = builtItems.get(key);
        if (existing) return existing;
        const pending = build(product);
        builtItems.set(key, pending);
        pending.catch(() => builtItems.delete(key));
        return pending;
      })();
  return { ...base, id: product.id, displayName: product.displayName };
}

export type RecallSubject = Pick<CabinetItem, "id" | "displayName" | "productNdc" | "kind">;

export type BuiltCabinet = {
  readonly items: readonly CabinetItem[];
  readonly unchecked: readonly string[];
  readonly recallSubjects: readonly RecallSubject[];
};

export async function buildCabinet(products: readonly Product[]): Promise<BuiltCabinet> {
  const settled = await Promise.allSettled(products.map(builtOnce));
  const items: CabinetItem[] = [];
  const unchecked: string[] = [];
  const failed: RecallSubject[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      console.error("could not build cabinet item", products[index].id, outcome.reason);
      unchecked.push(products[index].displayName);
      const product = products[index];
      if (product.productNdc && product.kind !== "supplement") {
        failed.push({ id: product.id, displayName: product.displayName, productNdc: product.productNdc, kind: product.kind });
      }
      return;
    }
    if (outcome.value.label === undefined && !products[index].peptideId) unchecked.push(products[index].displayName);
    items.push(outcome.value);
  });
  return { items, unchecked, recallSubjects: [...items, ...failed] };
}

// People type allergies as "Penicillin (hives)", "Sulfa drugs - rash" or a brand name like "Keflex".
function cleanAllergy(allergy: string): string {
  return allergy
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s+[-–:]\s+.*$/, "")
    .replace(/\b(?:allergy|allergies|allergic|to)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const BRAND_ALLERGENS: Readonly<Record<string, string>> = {
  keflex: "cephalexin", bactrim: "sulfa", septra: "sulfa", motrin: "ibuprofen", advil: "ibuprofen",
  aleve: "naproxen", naprosyn: "naproxen", augmentin: "amoxicillin", amoxil: "amoxicillin", zithromax: "azithromycin",
  "z-pak": "azithromycin", zpak: "azithromycin", cipro: "ciprofloxacin", levaquin: "levofloxacin", tylenol: "acetaminophen",
  coumadin: "warfarin", bayer: "aspirin", ecotrin: "aspirin", vicodin: "hydrocodone", norco: "hydrocodone",
  percocet: "oxycodone", celebrex: "celecoxib", toradol: "ketorolac", lasix: "furosemide", macrobid: "nitrofurantoin",
  flagyl: "metronidazole", benadryl: "diphenhydramine", "tylenol 3": "codeine", "tylenol with codeine": "codeine",
};

function withGenericName(allergy: string): readonly string[] {
  const generic = BRAND_ALLERGENS[allergy.toLowerCase()];
  return generic ? [allergy, generic] : [allergy];
}

export function toHealthProfile(profile: Profile): HealthProfile {
  return {
    ageYears: profile.ageYears,
    pregnant: profile.pregnant,
    breastfeeding: profile.breastfeeding,
    drinksThreeOrMoreDaily: profile.drinksThreeOrMoreDaily,
    conditions: profile.conditions,
    allergies: profile.allergies.map(cleanAllergy).filter((allergy) => allergy !== "").flatMap(withGenericName),
  };
}

const SEVERITY_RANK: Record<Flag["severity"], number> = { stop: 0, ask: 1, info: 2 };

function quotesOf(flag: EngineFlag): readonly FlagQuote[] {
  const all = [flag.quote, ...(flag.supportingQuotes ?? [])].filter((quote) => quote !== undefined);
  const fromLabels = all.map((quote) => ({ excerpt: quote.excerpt, section: quote.section, itemId: quote.itemId }));
  if (!flag.source) return fromLabels;
  const section = flag.type === "daily_total" ? "reference_label" : "fda_statement";
  const official = { excerpt: flag.source.text, section, itemId: flag.itemIds[0] ?? "", sourceUrl: flag.source.sourceUrl };
  return [...fromLabels, official];
}

const PER_PRODUCT_PROFILE_KINDS: ReadonlySet<string> = new Set(["pregnancy", "allergen", "age"]);

function groupKey(flag: EngineFlag): string {
  if (flag.type === "interaction") return `interaction:${[...flag.itemIds].sort().join("+")}`;
  if (flag.type === "profile") {
    const kind = flag.match?.kind ?? "other";
    // Each product gets its own pregnancy, allergy and age card, so no product's warning hides behind another's.
    const perProduct = PER_PRODUCT_PROFILE_KINDS.has(kind) ? `:${[...flag.itemIds].sort().join("+")}` : "";
    return `profile:${kind}:${flag.match?.term ?? flag.title}${perProduct}`;
  }
  return `${flag.type}:${[...flag.itemIds].sort().join("+")}:${flag.title}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

const PRESCRIBED_KINDS: ReadonlySet<string> = new Set(["rx"]);
const TITLE_SUBJECT = / is in \d| daily total/;

function highlightTerms(members: readonly EngineFlag[]): readonly string[] {
  const terms = members.flatMap((member) => {
    const fromMatch = [member.match?.term, member.match?.ingredient];
    const subject = TITLE_SUBJECT.test(member.title) ? member.title.split(TITLE_SUBJECT)[0] : undefined;
    return [...fromMatch, subject];
  });
  return [...new Set(terms.filter((term): term is string => typeof term === "string" && term.trim().length > 2))];
}

const STRONG_SECTIONS: readonly string[] = ["do_not_use"];

function sectionRank(flag: EngineFlag): number {
  const index = STRONG_SECTIONS.indexOf(flag.quote?.section ?? "");
  return index < 0 ? STRONG_SECTIONS.length : index;
}

function mergeGroup(
  key: string,
  members: readonly EngineFlag[],
  names: ReadonlyMap<string, string>,
  kinds: ReadonlyMap<string, string>,
): Flag {
  const [first] = members;
  const itemIds = [...new Set(members.flatMap((member) => member.itemIds))];
  const seen = new Set<string>();
  // The strongest line leads: the more severe flag first, then an OTC "Do not use" line.
  const ordered = [...members].sort((a, b) =>
    SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || sectionRank(a) - sectionRank(b));
  const quotes = ordered.flatMap(quotesOf).filter((quote) => {
    const id = `${quote.itemId}:${quote.excerpt}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const severity = members.map((member) => member.severity).sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
  const prescribed = itemIds.some((id) => PRESCRIBED_KINDS.has(kinds.get(id) ?? ""));
  const allPrescribed = itemIds.length > 0 && itemIds.every((id) => PRESCRIBED_KINDS.has(kinds.get(id) ?? ""));
  const reasons = [...new Set(members.map((member) => member.matchedBecause).filter((reason): reason is string => !!reason))];
  const shared = {
    id: key,
    type: first.type,
    severity,
    itemIds,
    quotes,
    highlight: highlightTerms(members),
    prescribed,
    allPrescribed,
    ...(reasons.length > 0 ? { matchedBecause: reasons } : {}),
    ...(first.match?.kind ? { matchKind: first.match.kind } : {}),
  };
  if (first.type === "interaction") {
    const pairNames = itemIds.map((id) => names.get(id) ?? "a product");
    // "Lisinopril and Hydrochlorothiazide and Aspirin" hides where one product ends.
    const pair = pairNames.join(pairNames.some((name) => / and /i.test(name)) ? " with " : " and ");
    const count = quotes.length === 1 ? "A label warns" : `${quotes.length} label lines warn`;
    return { ...shared, title: pair, explain: `${count} about taking these together. Check with a pharmacist before taking both.` };
  }
  if (first.type === "profile" && members.length > 1) {
    const subject = sentenceCase(first.title.split(" and ").pop() ?? first.title);
    return { ...shared, title: subject, explain: `${itemIds.length} of your products carry a label warning that applies to you here.` };
  }
  return { ...shared, title: sentenceCase(first.title), explain: first.explain };
}

export function groupFlags(flags: readonly EngineFlag[], items: readonly CabinetItem[]): readonly Flag[] {
  const names = new Map(items.map((item) => [item.id, item.displayName]));
  const kinds = new Map(items.map((item) => [item.id, item.kind]));
  const groups = new Map<string, EngineFlag[]>();
  for (const flag of flags) {
    const key = groupKey(flag);
    groups.set(key, [...(groups.get(key) ?? []), flag]);
  }
  return [...groups.entries()]
    .map(([key, members]) => mergeGroup(key, members, names, kinds))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

// High potassium is most dangerous with weak kidneys or older age, so the same
// label line is more urgent for those people.
function raisedForProfile(flag: EngineFlag, profile: Profile): EngineFlag {
  const atRisk = profile.conditions.includes("kidney_disease") || (profile.ageYears ?? 0) >= 65;
  if (!atRisk || flag.type !== "interaction" || flag.severity === "stop") return flag;
  const texts = [flag.quote, ...(flag.supportingQuotes ?? [])].map((quote) => quote?.text ?? "");
  return texts.some((text) => /\bhyperkalemia\b/i.test(text) && /\bpotassium\b/i.test(text)) ? { ...flag, severity: "stop" } : flag;
}

export function flagsFor(items: readonly CabinetItem[], profile: Profile): readonly Flag[] {
  const engineFlags = checkCabinet(items, toHealthProfile(profile)).map((flag) => raisedForProfile(flag, profile));
  return groupFlags([...peptideCabinetFlags(items), ...engineFlags], items);
}
