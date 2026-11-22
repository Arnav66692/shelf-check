import { childRecord, recordArrayField, stringArrayField, stringField, unique } from "./http.ts";
import type { JsonResponse } from "./http.ts";

const RXNAV_URL = "https://rxnav.nlm.nih.gov/REST";
const APPROXIMATE_MAX_ENTRIES = 5;

export function spellingUrl(name: string): string {
  return `${RXNAV_URL}/spellingsuggestions.json?name=${encodeURIComponent(name)}`;
}

export function approximateTermUrl(term: string): string {
  return `${RXNAV_URL}/approximateTerm.json?term=${encodeURIComponent(term)}&maxEntries=${APPROXIMATE_MAX_ENTRIES}`;
}

export function baseIngredientsUrl(rxcui: string): string {
  return `${RXNAV_URL}/rxcui/${encodeURIComponent(rxcui)}/related.json?tty=IN`;
}

export function toSpellingSuggestions(response: JsonResponse): readonly string[] {
  return stringArrayField(childRecord(childRecord(response.body, "suggestionGroup"), "suggestionList"), "suggestion");
}

export function toApproximateRxcuis(response: JsonResponse): readonly string[] {
  const candidates = recordArrayField(childRecord(response.body, "approximateGroup"), "candidate");
  const named = candidates.filter((candidate) => stringField(candidate, "name") !== undefined);
  const unnamed = candidates.filter((candidate) => stringField(candidate, "name") === undefined);
  return unique([...named, ...unnamed].flatMap((candidate) => stringField(candidate, "rxcui") ?? []));
}

export function toIngredientNames(response: JsonResponse): readonly string[] {
  return recordArrayField(childRecord(response.body, "relatedGroup"), "conceptGroup").flatMap((group) =>
    recordArrayField(group, "conceptProperties").flatMap((concept) => stringField(concept, "name") ?? []),
  );
}
