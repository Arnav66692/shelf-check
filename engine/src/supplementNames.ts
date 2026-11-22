import type { Ingredient } from "./types.ts";

// These are nutrition-panel totals. Named oils, fatty acids and protein
// preparations remain available as ingredients in their own right.
const NUTRITION_FACT = /^(?:calories?(?: from (?:saturated )?fat)?|energy(?: value)?|(?:total )?(?:(?:saturated|trans|polyunsaturated|monounsaturated|unsaturated) )?fats?|(?:saturated|trans|polyunsaturated|monounsaturated) fatty acids|cholesterol|sodium|(?:total |net |available )?carbohydrates?|(?:total |added )?sugars?|sugar alcohols?|(?:total |soluble |insoluble )?(?:dietary )?fib(?:er|re)|(?:total )?proteins?)$/i;

export function isNutritionFact(name: string): boolean {
  return NUTRITION_FACT.test(name.replace(/\s*\([^()]*\)\s*$/, "").trim().replace(/\s+/g, " "));
}

export function isNutritionIngredient(ingredient: Ingredient): boolean {
  return [ingredient.name, ingredient.printedName, ...(ingredient.commonNames ?? [])]
    .some((name) => name !== undefined && isNutritionFact(name));
}

export interface CommonName {
  readonly term: string;
  readonly notFollowedBy?: RegExp;
}

interface CommonNameRule {
  readonly appliesTo: RegExp;
  readonly names: readonly CommonName[];
}

// Drug labels name supplements by their everyday name, not by the RxNorm or DSLD name.
// "notFollowedBy" keeps a nutrient name from matching a drug class or a lab term that starts with it.
export const COMMON_NAME_RULES: readonly CommonNameRule[] = [
  { appliesTo: /st\.? john['’]?s wort|hypericum/i, names: [{ term: "St. John's wort" }, { term: "Hypericum perforatum" }] },
  { appliesTo: /ginkgo/i, names: [{ term: "ginkgo" }] },
  { appliesTo: /fish oil|omega-3|eicosapenta|docosahexa/i, names: [{ term: "fish oil" }, { term: "omega-3" }] },
  {
    appliesTo: /vitamin k|phytonadione|phylloquinone|menaquinone|vitamin mk/i,
    names: [{ term: "vitamin K", notFollowedBy: /^[\s-]*(?:antagonist|dependent|epoxide|deficiency)/i }],
  },
  { appliesTo: /vitamin e\b|tocopherol/i, names: [{ term: "vitamin E" }] },
  { appliesTo: /garlic|allium sativum/i, names: [{ term: "garlic" }] },
  { appliesTo: /ginseng/i, names: [{ term: "ginseng" }] },
  { appliesTo: /calcium/i, names: [{ term: "calcium", notFollowedBy: /^[\s-]*(?:channel|uremic)/i }] },
  { appliesTo: /\biron\b|ferrous|ferric/i, names: [{ term: "iron", notFollowedBy: /^[\s-]*(?:oxide|deficiency)/i }] },
  { appliesTo: /magnesium/i, names: [{ term: "magnesium", notFollowedBy: /^[\s-]*stearate/i }] },
];

// A later entry replaces an earlier one with the same term, so a rule's guard wins over a bare printed name.
function uniqueByTerm(names: readonly CommonName[]): readonly CommonName[] {
  return [...new Map(names.map((name) => [name.term.toLowerCase(), name] as const)).values()];
}

export function commonNamesFor(ingredient: Ingredient): readonly CommonName[] {
  const printedNames = ingredient.commonNames ?? [];
  const knownAs = [ingredient.name, ...printedNames];
  const fromRules = COMMON_NAME_RULES.filter((rule) => knownAs.some((name) => rule.appliesTo.test(name))).flatMap(
    (rule) => rule.names,
  );
  return uniqueByTerm([...printedNames.map((term) => ({ term })), ...fromRules]);
}
