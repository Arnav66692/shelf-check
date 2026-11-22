import { expect } from "vitest";
import { buildCabinetItem } from "../../src/cabinet.ts";
import type { CabinetSources } from "../../src/cabinet.ts";
import { createDsldClient } from "../../src/sources/dsld.ts";
import { createOpenFdaClient } from "../../src/sources/openfda.ts";
import { createRxNavClient } from "../../src/sources/rxnav.ts";
import { buildSupplementItem } from "../../src/supplement.ts";
import type { SupplementSources } from "../../src/supplement.ts";
import type { CabinetItem, Flag, Quote } from "../../src/types.ts";
import { createFixtureFetch } from "./fixtures.ts";
import { PRODUCT_NDCS, SUPPLEMENT_DSLD_IDS } from "./products.ts";

export type ProductId = keyof typeof PRODUCT_NDCS;
export type SupplementId = keyof typeof SUPPLEMENT_DSLD_IDS;

export function fixtureSources(): CabinetSources & SupplementSources {
  const fetch = createFixtureFetch();
  return {
    openFda: createOpenFdaClient({ fetch }),
    rxNav: createRxNavClient({ fetch }),
    dsld: createDsldClient({ fetch }),
  };
}

export function loadSupplements(...ids: readonly SupplementId[]): Promise<readonly CabinetItem[]> {
  const sources = fixtureSources();
  return Promise.all(ids.map((id) => buildSupplementItem({ id, dsldId: SUPPLEMENT_DSLD_IDS[id] }, sources)));
}

export async function loadMixedCabinet(
  productIds: readonly ProductId[],
  supplementIds: readonly SupplementId[],
): Promise<readonly CabinetItem[]> {
  return [...(await loadCabinet(...productIds)), ...(await loadSupplements(...supplementIds))];
}

export function loadCabinet(...ids: readonly ProductId[]): Promise<readonly CabinetItem[]> {
  const sources = fixtureSources();
  return Promise.all(ids.map((id) => buildCabinetItem({ id, productNdc: PRODUCT_NDCS[id] }, sources)));
}

export function withoutLabel(item: CabinetItem): CabinetItem {
  const { label: _label, ...rest } = item;
  return rest;
}

export function expectVerbatim(quote: Quote | undefined, items: readonly CabinetItem[]): void {
  expect(quote).toBeDefined();
  if (quote === undefined) return;
  const owner = items.find((item) => item.id === quote.itemId);
  const paragraphs = owner?.label?.[quote.section] ?? [];
  expect(paragraphs.some((paragraph) => paragraph.includes(quote.text))).toBe(true);
}

export function flagsOfType(flags: readonly Flag[], type: Flag["type"]): readonly Flag[] {
  return flags.filter((flag) => flag.type === type);
}
