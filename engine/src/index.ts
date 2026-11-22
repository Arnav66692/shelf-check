import { dailyTotalFlags } from "./flags/dailyTotal.ts";
import { duplicateFlags } from "./flags/duplicates.ts";
import { interactionFlags } from "./flags/interactions.ts";
import { profileFlags } from "./flags/profile.ts";
import type { HealthProfile } from "./flags/profile.ts";
import { sortBySeverity } from "./flags/severity.ts";
import type { CabinetItem, Flag } from "./types.ts";

export class DuplicateItemIdError extends Error {
  constructor(id: string) {
    super(`Two cabinet items share the id "${id}". Each item needs its own id so flags can point at it.`);
    this.name = "DuplicateItemIdError";
  }
}

function requireUniqueIds(items: readonly CabinetItem[]): void {
  const repeated = items.find((item, index) => items.findIndex((other) => other.id === item.id) !== index);
  if (repeated !== undefined) throw new DuplicateItemIdError(repeated.id);
}

export function checkCabinet(items: readonly CabinetItem[], profile?: HealthProfile): readonly Flag[] {
  requireUniqueIds(items);
  return sortBySeverity([
    ...duplicateFlags(items),
    ...dailyTotalFlags(items, profile),
    ...interactionFlags(items),
    ...(profile === undefined ? [] : profileFlags(items, profile)),
  ]);
}

export * from "./types.ts";
export * from "./cabinet.ts";
export * from "./classPhrases.ts";
export * from "./symptoms.ts";
export * from "./supplement.ts";
export * from "./supplementNames.ts";
export * from "./peptides.ts";
export * from "./peptideLabels.ts";
export * from "./peptideCabinet.ts";
export * from "./recalls.ts";
export * from "./recallClasses.ts";
export * from "./pills.ts";
export * from "./disposal.ts";
export * from "./flags/dailyTotal.ts";
export * from "./flags/duplicates.ts";
export * from "./flags/interactions.ts";
export * from "./flags/profile.ts";
export * from "./flags/units.ts";
export * from "./flags/labelTags.ts";
export * from "./flags/reconstitution.ts";
export { severityForSection, sortBySeverity } from "./flags/severity.ts";
export { createOpenFdaClient, openFdaApiKeyFromEnv, parseStrength, PER_EACH_UNIT, StrengthParseError } from "./sources/openfda.ts";
export type { NdcProduct, OpenFdaClient, OpenFdaClientOptions, Strength } from "./sources/openfda.ts";
export { createDsldClient } from "./sources/dsld.ts";
export type {
  DsldClient,
  DsldClientOptions,
  DsldIngredientRow,
  DsldLabel,
  DsldOtherIngredient,
  DsldQuantity,
  DsldSearchHit,
  DsldServingSize,
  DsldStatement,
} from "./sources/dsld.ts";
export { excerptAround, MAX_EXCERPT_LENGTH } from "./text.ts";
export type { TextSpan } from "./text.ts";
export { createRxNavClient } from "./sources/rxnav.ts";
export type { RxConcept, RxNavClient } from "./sources/rxnav.ts";
export { HttpError, ResponseShapeError } from "./sources/http.ts";
export type { FetchFn, FetchResponse } from "./sources/http.ts";
