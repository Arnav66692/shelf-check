import { commonNamesFor } from "./supplementNames.ts";
import { mechanismTermsFor, type MechanismTerm } from "./mechanismClasses.ts";
import type { DrugClass, Ingredient, InteractionMatchKind } from "./types.ts";

interface ClassPhraseRule {
  readonly atcPrefixes: readonly string[];
  readonly epcNames: readonly string[];
  readonly phrases: readonly string[];
  readonly memberName?: RegExp;
}

// These label aliases use RxClass membership. Clinical mechanism phrases are in mechanismClasses.ts.
export const CLASS_PHRASE_RULES: readonly ClassPhraseRule[] = [
  {
    atcPrefixes: ["M01A"],
    epcNames: ["Nonsteroidal Anti-inflammatory Drug"],
    phrases: ["NSAID", "non-steroidal anti-inflammatory"],
  },
  {
    atcPrefixes: ["B01AA", "B01AB", "B01AE", "B01AF"],
    epcNames: ["Vitamin K Antagonist", "Anticoagulant", "Factor Xa Inhibitor", "Direct Thrombin Inhibitor"],
    phrases: ["anti-coagulant", "anticoagulation", "blood thinner", "blood thinning", "thinning the blood"],
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
  {
    // N02AJ also maps non-opioid ingredients of combination products to opioids.
    // Use the opioid-only groups and keep mixed groups out of this mapping.
    atcPrefixes: ["N02AA", "N02AB", "N02AC", "N02AD", "N02AE", "N02AF", "N02AX", "N05BA", "N03AE", "N05C", "R06AA", "R06AB", "R06AD"],
    epcNames: ["Opioid Agonist", "Opioid Partial Agonist", "Benzodiazepine"],
    phrases: ["CNS depressant", "central nervous system depressant", "central nervous system (CNS) depressant"],
  },
  {
    atcPrefixes: ["N05C"],
    epcNames: [],
    phrases: ["hypnotic", "sedative/hypnotic", "sedative-hypnotic"],
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
    atcPrefixes: ["C07"],
    epcNames: ["beta-Adrenergic Blocker"],
    phrases: ["beta-blocker", "beta blocker", "beta-adrenergic blocking agent", "beta-adrenergic blocker"],
  },
  {
    atcPrefixes: ["C09C", "C09D"],
    epcNames: ["Angiotensin 2 Receptor Blocker"],
    phrases: ["angiotensin receptor blocker", "angiotensin II receptor blocker", "ARB"],
  },
  {
    atcPrefixes: ["C03"],
    epcNames: ["Thiazide Diuretic", "Loop Diuretic", "Potassium-sparing Diuretic", "Thiazide-like Diuretic"],
    phrases: ["diuretic", "water pill"],
  },
  { atcPrefixes: ["N02BA"], epcNames: [], phrases: ["salicylate"] },
  { atcPrefixes: ["H02AB"], epcNames: ["Corticosteroid"], phrases: ["corticosteroid", "steroid drug"] },
  { atcPrefixes: ["A02A"], epcNames: [], phrases: ["antacid"] },
  // A10A includes insulin combinations. A non-insulin coingredient can also
  // acquire that ATC code and must not stand in for insulin on another label.
  { atcPrefixes: ["A10A"], epcNames: ["Insulin", "Insulin Analog"], phrases: ["insulin"], memberName: /^(?:human )?insulin(?: |$)/i },
];

const ATC_CLASS_TYPE = "ATC1-4";
const EPC_CLASS_TYPE = "EPC";
const NAME_QUALIFIER = /\s*(?:,\s*(?:plain|combinations?)|\bexcl\..*)$/i;
const CATCH_ALL_NAME = /^other\b/i;

export interface SearchTerm {
  readonly term: string;
  readonly kind: InteractionMatchKind;
  readonly ingredient: string;
  readonly drugClass?: DrugClass;
  readonly mechanism?: MechanismTerm;
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

// ATC names some diuretic subgroups by chemical structure. On another label,
// "sulfonamides" means the sulfa antibiotics, not furosemide or a thiazide.
function isStructureOnlyName(drugClass: DrugClass): boolean {
  return drugClass.type === ATC_CLASS_TYPE && drugClass.id.startsWith("C03") && /^sulfonamides\b/i.test(drugClass.name);
}

export function classNamesFor(classes: readonly DrugClass[]): readonly string[] {
  const names = classes
    .filter((drugClass) => !isStructureOnlyName(drugClass))
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
    ...mechanismTermsFor(ingredient).map((mechanism) => ({ ...toTerm("class_phrase")(mechanism.term), mechanism })),
    ...classes.flatMap((drugClass) => classNamesFor([drugClass]).map((name) => ({ ...toTerm("class_name")(name), drugClass }))),
    ...CLASS_PHRASE_RULES.flatMap((rule) => {
      if (rule.memberName && !rule.memberName.test(ingredient.name)) return [];
      const drugClass = classes.find((candidate) => ruleApplies(rule, candidate));
      return drugClass ? rule.phrases.map((phrase) => ({ ...toTerm("class_phrase")(phrase), drugClass })) : [];
    }),
  ];
}
