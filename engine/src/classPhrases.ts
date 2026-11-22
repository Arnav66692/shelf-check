import { commonNamesFor } from "./supplementNames.ts";
import type { DrugClass, Ingredient, InteractionMatchKind } from "./types.ts";

interface ClassPhraseRule {
  readonly atcPrefixes: readonly string[];
  readonly epcNames: readonly string[];
  readonly phrases: readonly string[];
}

// Hand-written wording that labels use for a class. The class membership itself always comes from RxClass.
export const CLASS_PHRASE_RULES: readonly ClassPhraseRule[] = [
  {
    atcPrefixes: ["M01A"],
    epcNames: ["Nonsteroidal Anti-inflammatory Drug"],
    phrases: ["NSAID", "non-steroidal anti-inflammatory"],
  },
  {
    atcPrefixes: ["B01AA", "B01AB", "B01AE", "B01AF"],
    epcNames: ["Vitamin K Antagonist", "Anticoagulant", "Factor Xa Inhibitor", "Direct Thrombin Inhibitor"],
    phrases: ["anti-coagulant", "blood thinner", "blood thinning"],
  },
  {
    atcPrefixes: ["B01AC"],
    epcNames: ["Platelet Aggregation Inhibitor"],
    phrases: ["anti-platelet", "platelet aggregation inhibitor", "platelet inhibitor"],
  },
  {
    atcPrefixes: ["N06AF", "N06AG", "N04BD"],
    epcNames: ["Monoamine Oxidase Inhibitor"],
    phrases: ["MAOI", "monoamine oxidase inhibitor", "MAO inhibitor"],
  },
  {
    atcPrefixes: ["N05A", "N05B", "N05C"],
    epcNames: ["Benzodiazepine", "Barbiturate"],
    phrases: ["sedative", "tranquilizer", "sleeping pill"],
  },
  // ATC splits antihistamines by chemistry. These three subgroups are the older, sedating ones
  // (diphenhydramine, doxylamine, chlorpheniramine, promethazine). R06AE and R06AX mix sedating and
  // non-sedating drugs (cetirizine, loratadine), so they are left out instead of guessed.
  {
    atcPrefixes: ["R06AA", "R06AB", "R06AD"],
    epcNames: [],
    phrases: ["sedative", "tranquilizer"],
  },
  {
    atcPrefixes: ["R06A"],
    epcNames: ["Antihistamine", "Histamine-1 Receptor Antagonist"],
    phrases: ["antihistamine"],
  },
  {
    atcPrefixes: ["N06AB"],
    epcNames: ["Serotonin Reuptake Inhibitor"],
    phrases: ["SSRI", "selective serotonin reuptake inhibitor", "serotonin reuptake inhibitor"],
  },
  {
    atcPrefixes: ["C09A", "C09B"],
    epcNames: ["Angiotensin Converting Enzyme Inhibitor"],
    phrases: ["ACE inhibitor", "angiotensin converting enzyme inhibitor"],
  },
  {
    atcPrefixes: ["C03"],
    epcNames: ["Thiazide Diuretic", "Loop Diuretic", "Potassium-sparing Diuretic", "Thiazide-like Diuretic"],
    phrases: ["diuretic", "water pill"],
  },
  { atcPrefixes: ["N02BA"], epcNames: [], phrases: ["salicylate"] },
  { atcPrefixes: ["H02AB"], epcNames: ["Corticosteroid"], phrases: ["corticosteroid", "steroid drug"] },
  { atcPrefixes: ["A02A"], epcNames: [], phrases: ["antacid"] },
];

const ATC_CLASS_TYPE = "ATC1-4";
const EPC_CLASS_TYPE = "EPC";
const NAME_QUALIFIER = /\s*(?:,\s*(?:plain|combinations?)|\bexcl\..*)$/i;
const CATCH_ALL_NAME = /^other\b/i;

export interface SearchTerm {
  readonly term: string;
  readonly kind: InteractionMatchKind;
  readonly ingredient: string;
  readonly notFollowedBy?: RegExp;
}

function ruleApplies(rule: ClassPhraseRule, drugClass: DrugClass): boolean {
  if (drugClass.type === ATC_CLASS_TYPE) return rule.atcPrefixes.some((prefix) => drugClass.id.startsWith(prefix));
  if (drugClass.type === EPC_CLASS_TYPE) {
    return rule.epcNames.some((name) => name.toLowerCase() === drugClass.name.toLowerCase());
  }
  return false;
}

export function classPhrasesFor(classes: readonly DrugClass[]): readonly string[] {
  const phrases = CLASS_PHRASE_RULES.filter((rule) => classes.some((drugClass) => ruleApplies(rule, drugClass))).flatMap(
    (rule) => rule.phrases,
  );
  return [...new Set(phrases)];
}

export function classNamesFor(classes: readonly DrugClass[]): readonly string[] {
  const names = classes
    .map((drugClass) => drugClass.name.replace(NAME_QUALIFIER, "").trim())
    .filter((name) => name !== "" && !CATCH_ALL_NAME.test(name));
  return [...new Set(names)];
}

function isSameTerm(left: string, right: string): boolean {
  return left.trim().toLowerCase() === right.trim().toLowerCase();
}

// A plain nutrient name ("calcium", "iron") is also a lab value and part of drug class names, so when a
// common-name rule covers the ingredient's own name the guarded common name is used in its place.
export function searchTermsFor(ingredient: Ingredient): readonly SearchTerm[] {
  const classes = ingredient.classes ?? [];
  const toTerm = (kind: InteractionMatchKind) => (term: string): SearchTerm => ({ term, kind, ingredient: ingredient.name });
  const commonNames = commonNamesFor(ingredient).map((common) => ({ ...toTerm("common_name")(common.term), ...common }));
  const ownName = commonNames.some((common) => isSameTerm(common.term, ingredient.name))
    ? []
    : [toTerm("ingredient_name")(ingredient.name)];
  return [
    ...ownName,
    ...commonNames,
    ...classNamesFor(classes).map(toTerm("class_name")),
    ...classPhrasesFor(classes).map(toTerm("class_phrase")),
  ];
}
