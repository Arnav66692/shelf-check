import type { RecallClassification } from "./recalls.ts";
import type { OfficialStatement } from "./types.ts";

export type DefinedRecallClass = Exclude<RecallClassification, "Not Yet Classified">;

export const DEFINED_RECALL_CLASSES = ["Class I", "Class II", "Class III"] as const satisfies readonly DefinedRecallClass[];

export const FDA_RECALL_DEFINITIONS_URL = "https://www.fda.gov/safety/industry-guidance-recalls/recalls-background-and-definitions";
export const FDA_RECALL_DEFINITIONS_PAGE_DATE = "03/20/2026";

function recallDefinition(text: string): OfficialStatement {
  return { text, sourceUrl: FDA_RECALL_DEFINITIONS_URL, pageDate: FDA_RECALL_DEFINITIONS_PAGE_DATE };
}

export const RECALL_CLASS_DEFINITIONS: Readonly<Record<DefinedRecallClass, OfficialStatement>> = {
  "Class I": recallDefinition(
    "a situation in which there is a reasonable probability that the use of or exposure to a violative product will cause serious adverse health consequences or death.",
  ),
  "Class II": recallDefinition(
    "a situation in which use of or exposure to a violative product may cause temporary or medically reversible adverse health consequences or where the probability of serious adverse health consequences is remote.",
  ),
  "Class III": recallDefinition(
    "a situation in which use of or exposure to a violative product is not likely to cause adverse health consequences.",
  ),
};

export function isDefinedRecallClass(classification: string): classification is DefinedRecallClass {
  return DEFINED_RECALL_CLASSES.some((defined) => defined === classification);
}
