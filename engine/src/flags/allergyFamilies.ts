import type { Ingredient } from "../types.ts";

// ATC and EPC describe the resolved ingredient. Exact generic names also cover
// records without RxClass. A reported family allergy is distinct from an allergy
// to one particular member, which does not establish allergy to its siblings.
const NSAIDS = {
  name: "an NSAID",
  allergies: /^(?:NSAIDs?|non[- ]?steroidal anti[- ]?inflammator(?:y(?: drugs?)?|ies)|aspirin)$/i,
  // M01AX is a mixed group that includes glucosamine. Its members need
  // independent EPC or ingredient evidence before they count as NSAIDs.
  atc: /^(?:M01A[ABCEGH]|N02BA)/,
  epc: /^nonsteroidal anti-inflammatory drug$/i,
  ingredients: /^(?:aspirin|ibuprofen|naproxen|diclofenac|ketorolac|indomethacin|meloxicam|celecoxib|piroxicam|ketoprofen|nabumetone|etodolac|diflunisal)$/i,
  labelWords: /\b(?:NSAIDs?|nonsteroidal anti-?inflammatory drugs?)\b/i,
};

const FAMILIES = [
  {
    name: "a penicillin",
    allergies: /^(?:penicillins?|penicillin antibiotics?|PCN)$/i,
    // J01CG identifies beta-lactamase inhibitors and J01CR combinations.
    atc: /^J01C[AEF]/,
    epc: /^penicillin[- ]class antibacterial$/i,
    ingredients: /^(?:amoxicillin|ampicillin|dicloxacillin|nafcillin|oxacillin|piperacillin|ticarcillin|flucloxacillin|penicillin(?: [gv])?|benzylpenicillin|phenoxymethylpenicillin)$/i,
    labelWords: /\bpenicillins?\b/i,
  },
  {
    name: "a cephalosporin",
    allergies: /^cephalosporins?(?: antibiotics?)?$/i,
    atc: /^J01D[BCDE]/, // J01DH also falls under J01D and denotes carbapenems.
    epc: /^cephalosporin(?:[- ]class)? antibacterial$/i,
    ingredients: /^(?:cefadroxil|cefazolin|cephalexin|cefalexin|cefaclor|cefuroxime|cefdinir|cefixime|ceftriaxone|cefepime|cefpodoxime|ceftazidime|ceftaroline)$/i,
    labelWords: /\bcephalosporins?\b/i,
  },
  {
    name: "a sulfonamide antibiotic",
    allergies: /^(?:sulfa|sulpha|sulfonamides?|sulphonamides?)(?: (?:drugs?|antibiotics?))?$/i,
    atc: /^J01E[BCD]/, // J01EA (trimethoprim) is not a sulfonamide.
    epc: /^sulfonamide (?:antibacterial|antimicrobial)$/i,
    ingredients: /^(?:sulfamethoxazole|sulfadiazine|sulfisoxazole|sulfacetamide|sulfadoxine)$/i,
    labelWords: /\b(?:sulfonamides?|sulfa drugs?)\b/i,
  },
  {
    name: "a salicylate",
    allergies: /^(?:aspirin|salicylates?)$/i,
    atc: /^N02BA/,
    epc: /^salicylate$/i,
    ingredients: /^(?:aspirin|acetylsalicylic acid|bismuth subsalicylate|salsalate|diflunisal|choline salicylate|magnesium salicylate|sodium salicylate)$/i,
    labelWords: /\b(?:aspirin|salicylates?)\b/i,
  },
  NSAIDS,
  {
    name: "an opioid",
    allergies: /^(?:opioids?|opiates?)(?: analgesics?)?$/i,
    atc: /^(?:N02A[ABCEFGX]|N01AH)/,
    epc: /^(?:(?:full|partial) )?opioid agonist$/i,
    ingredients: /^(?:morphine|codeine|hydrocodone|oxycodone|oxymorphone|hydromorphone|fentanyl|tramadol|tapentadol|buprenorphine|methadone|meperidine)$/i,
    labelWords: /\b(?:opioids?|opiates?)\b/i,
  },
  {
    name: "an ACE inhibitor",
    allergies: /^(?:ACE inhibitors?|angiotensin.converting enzyme inhibitors?)$/i,
    atc: /^C09[AB]/,
    epc: /^angiotensin converting enzyme inhibitor$/i,
    ingredients: /^(?:lisinopril|enalapril|ramipril|benazepril|captopril|quinapril|fosinopril|perindopril|trandolapril|moexipril)$/i,
    labelWords: /\b(?:ACE inhibitors?|angiotensin[- ]converting enzyme inhibitors?)\b/i,
  },
  {
    name: "a quinolone antibiotic",
    allergies: /^(?:(?:fluoro)?quinolones?)(?: antibiotics?)?$/i,
    atc: /^J01M/,
    epc: /^(?:fluoro)?quinolone antibacterial$/i,
    ingredients: /^(?:ciprofloxacin|levofloxacin|moxifloxacin|ofloxacin|gemifloxacin|delafloxacin)$/i,
    labelWords: /\b(?:fluoro)?quinolones?\b/i,
  },
];

function belongsTo(ingredient: Ingredient, family: typeof NSAIDS): boolean {
  if (ingredient.classes?.some((group) =>
    (group.type === "ATC1-4" && family.atc.test(group.id)) ||
    (group.type === "EPC" && family.epc.test(group.name)),
  )) return true;
  return [ingredient.name, ingredient.printedName].some((name) =>
    name && family.ingredients.test(name.trim().replace(/ (?:hydrochloride|hcl|sodium|potassium|sulfate|trihydrate|monohydrate)$/i, "")),
  );
}

export function allergyFamily(ingredient: Ingredient, allergen: string): string | undefined {
  return FAMILIES.find((family) => family.allergies.test(allergen) && belongsTo(ingredient, family))?.name;
}

export function isNsaid(ingredient: Ingredient): boolean {
  return belongsTo(ingredient, NSAIDS);
}

// An allergy to one NSAID, by its drug name, typed in the profile.
export function isNsaidName(allergen: string): boolean {
  return NSAIDS.ingredients.test(allergen.trim()) && !/^aspirin$/i.test(allergen.trim());
}

// How labels name the family that a typed allergy belongs to ("PCN" -> "penicillin", "levofloxacin" -> "quinolone").
export function familyLabelWords(allergen: string): RegExp | undefined {
  const typed = allergen.trim();
  return FAMILIES.find((family) => family.allergies.test(typed) || family.ingredients.test(typed))?.labelWords;
}
