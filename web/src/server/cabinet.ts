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
import type { Flag, FlagQuote, Product, Profile } from "@/lib/model";

const openFda = createOpenFdaClient();
const rxNav = createRxNavClient();
const dsld = createDsldClient();
const builtItems = new Map<string, Promise<CabinetItem>>();

function build(product: Product): Promise<CabinetItem> {
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

function builtOnce(product: Product): Promise<CabinetItem> {
  const existing = builtItems.get(product.id);
  if (existing) return existing;
  const pending = build(product);
  builtItems.set(product.id, pending);
  pending.catch(() => builtItems.delete(product.id));
  return pending;
}

export type BuiltCabinet = { readonly items: readonly CabinetItem[]; readonly unchecked: readonly string[] };

export async function buildCabinet(products: readonly Product[]): Promise<BuiltCabinet> {
  const settled = await Promise.allSettled(products.map(builtOnce));
  const items: CabinetItem[] = [];
  const unchecked: string[] = [];
  settled.forEach((outcome, index) => {
    if (outcome.status === "rejected") {
      console.error("could not build cabinet item", products[index].id, outcome.reason);
      unchecked.push(products[index].displayName);
      return;
    }
    if (outcome.value.label === undefined) unchecked.push(products[index].displayName);
    items.push(outcome.value);
  });
  return { items, unchecked };
}

export function toHealthProfile(profile: Profile): HealthProfile {
  return {
    ageYears: profile.ageYears,
    pregnant: profile.pregnant,
    breastfeeding: profile.breastfeeding,
    drinksThreeOrMoreDaily: profile.drinksThreeOrMoreDaily,
    conditions: profile.conditions,
    allergies: profile.allergies.map((allergy) => allergy.trim()).filter((allergy) => allergy !== ""),
  };
}

const SEVERITY_RANK: Record<Flag["severity"], number> = { stop: 0, ask: 1, info: 2 };

function quotesOf(flag: EngineFlag): readonly FlagQuote[] {
  const all = [flag.quote, ...(flag.supportingQuotes ?? [])].filter((quote) => quote !== undefined);
  return all.map((quote) => ({ excerpt: quote.excerpt, section: quote.section, itemId: quote.itemId }));
}

function groupKey(flag: EngineFlag): string {
  if (flag.type === "interaction") return `interaction:${[...flag.itemIds].sort().join("+")}`;
  if (flag.type === "profile") return `profile:${flag.match?.kind ?? "other"}:${flag.match?.term ?? flag.title}`;
  return `${flag.type}:${[...flag.itemIds].sort().join("+")}:${flag.title}`;
}

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function mergeGroup(key: string, members: readonly EngineFlag[], names: ReadonlyMap<string, string>): Flag {
  const [first] = members;
  const itemIds = [...new Set(members.flatMap((member) => member.itemIds))];
  const seen = new Set<string>();
  const quotes = members.flatMap(quotesOf).filter((quote) => {
    const id = `${quote.itemId}:${quote.excerpt}`;
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
  const severity = members.map((member) => member.severity).sort((a, b) => SEVERITY_RANK[a] - SEVERITY_RANK[b])[0];
  const shared = { id: key, type: first.type, severity, itemIds, quotes };
  if (first.type === "interaction") {
    const pair = itemIds.map((id) => names.get(id) ?? "a product").join(" and ");
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
  const groups = new Map<string, EngineFlag[]>();
  for (const flag of flags) {
    const key = groupKey(flag);
    groups.set(key, [...(groups.get(key) ?? []), flag]);
  }
  return [...groups.entries()]
    .map(([key, members]) => mergeGroup(key, members, names))
    .sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
}

export function flagsFor(items: readonly CabinetItem[], profile: Profile): readonly Flag[] {
  return groupFlags(checkCabinet(items, toHealthProfile(profile)), items);
}
