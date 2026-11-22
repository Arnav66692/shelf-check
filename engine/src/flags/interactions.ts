import { searchTermsFor } from "../classPhrases.ts";
import type { SearchTerm } from "../classPhrases.ts";
import { mechanismSpanAllowed, type MechanismTerm } from "../mechanismClasses.ts";
import { isNutritionIngredient } from "../supplementNames.ts";
import { sectionSentences, sectionTitle, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { escapeRegExp, termRegExp } from "../text.ts";
import type { TextSpan } from "../text.ts";
import type { CabinetItem, DrugClass, Flag, InteractionMatchKind, LabelSectionName, TermMatch } from "../types.ts";
import { severityForSection } from "./severity.ts";

export const INTERACTION_SECTIONS: readonly LabelSectionName[] = [
  "drug_interactions",
  "precautions",
  "boxed_warning",
  "warnings",
  "warnings_and_cautions",
  "contraindications",
  "do_not_use",
  "ask_doctor",
  "ask_doctor_or_pharmacist",
  "when_using",
];

// Sections whose only subject is taking this product with something else.
export const CO_USE_SECTIONS: readonly LabelSectionName[] = ["drug_interactions", "ask_doctor_or_pharmacist"];

// Wording that says the sentence is about taking two things together.
export const CO_USE_CUE =
  /\b(?:tak(?:e|es|en|ing)|concomitant(?:ly)?|concurrent(?:ly)?|co-?administ(?:er|ered|ration)|in combination with|combined with|together with|along with|with other|used? with|receiving|interact(?:s|ions?)?|potentiates?|(?:initiate|discontinue)s?|contraindicated|avoid(?:ed)?|do not (?:use|take)|may (?:increase|enhance|decrease|reduce))\b/i;

const CLAUSE_BREAK = /;|(?=\b(?:heart attack and stroke|stomach bleeding|allergy) (?:alert|warning)\b)|\bbut\b(?! particularly with)|\b(?:whereas|however|although|nevertheless)\b|,?\s+(?:and|or)\s+(?=(?:avoid|do not|monitor|ask|use caution|no |there (?:is|are)|if (?:you are )?allergic))/gi;
const ALLERGY = /\ballerg(?:y|ic|ies)\b/i;
const PROHIBITION = /\b(?:do|should|must) not (?:be (?:combined|co-?administered|taken|used|given)|take|use|administer|co-?administer|combine|exceed)\b/gi;
const UNRESOLVED_POLARITY = /\b(?:no|not|neither|nor|never|without|lack(?:s|ed|ing)?|unknown|unclear|unaffected|unnecessary|except(?:ion|ing)?|excluding|other than|rather than|instead of|compared (?:to|with)|alone(?! but particularly with)|monotherapy)\b/i;
const WARNING = /\b(?:avoid|(?:do|should|must) not (?:be (?:combined|co-?administered|taken|used)|take|use|administer|co-?administer|combine)|contraindicated|monitor(?:ed|ing)?|caution|ask (?:a |your )?(?:doctor|pharmacist)|potentiat\w*|interacts? with|interactions? between|(?:may|can|could) (?:increase|enhance|decrease|reduce|affect|interact)|(?:increas\w*|reduc\w*) (?:the )?(?:risks?|effects?|clearance|exposure|concentrations?)|(?:increas|decreas|reduc|elevat)\w* (?:[\w-]+ ){1,2}(?:concentrations?|levels?|exposure)|may result in deterioration|life-threatening|synergism|antagonism|(?:the )?risk (?:of [\w\s/,-]{1,80}? )?(?:is |are )?increas\w*|increases? the risk|risk factors? (?:for|of|include)|may be (?:reduced|decreased|increased)|less effective|do not exceed|may bind|(?:at least )?\d+ hours? (?:apart|before|after|prior)|(?:reduc|decreas)\w* (?:the )?(?:absorption|effectiveness|efficacy)|unintended pregnanc\w*|(?:back-?up|non-?hormonal) (?:method|contracepti)\w*)\b/i;
const SERIOUS_HARM = /\b(?:fatal|death|life[- ]threatening|respiratory depression|serotonin syndrome|(?:serious|severe|major) (?:[\w-]+ ){0,2}bleeding|rhabdomyolysis|(?:severe|life-threatening|fatal) hyperkalemia|unintended pregnanc\w*|(?:reduc|decreas)\w* (?:the )?effectiveness of (?:hormonal )?contracept\w*|contraceptive failure|(?:potentiat|increas|decreas|reduc|enhanc)\w* (?:the )?(?:anticoagulant |hypoprothrombinemic )?(?:effects?|response|activity) of (?:warfarin|oral anticoagulants?|coumarin\w*)|(?:potentiat|increas|decreas|reduc|enhanc)\w* the anticoagulant effects?|(?:increas|decreas|enhanc)\w* the response to (?:oral )?anticoagulant\w*|prolong\w* (?:the )?prothrombin time|(?:increas\w*|rais\w*|elevat\w*) (?:the )?(?:serum |plasma )?(?:lithium|digoxin) (?:serum |plasma )?(?:concentrations?|levels?)|increases? in (?:serum |plasma )?(?:lithium|digoxin) (?:concentrations?|levels?)|risk of lithium toxicity|(?:prothrombin time|INR)[^.;]{0,30}(?:increas|prolong|elevat)\w*|(?:increas|prolong|elevat)\w* (?:the )?(?:prothrombin time|INR)|(?:lithium|digoxin) toxicity has (?:been reported|resulted|occurred)|myelosuppression|bone marrow (?:suppression|toxicity)|agranulocytosis)\b/i;
const AVOID_COMBINATION = /\b(?:avoid(?:ed)?|contraindicated|do not (?:use|take)|should not be (?:used|taken|given))\b/i;
const RISK_REDUCTION = /\b(?:prevent(?:s|ed|ion of)?|(?:reduc(?:e[ds]?|tion)|lower(?:s|ed)?) (?:of |in )?(?:the )?(?:risk|incidence) of|to avoid)\s*$/i;
const AVOID_OTHER_TARGET = /\bavoid\s+([^,;]+?)\s+(?:(?:while|when|if)\s+(?:(?:you|patients?)\s+(?:are\s+)?)?(?:taking|using|receiving)|during treatment with)\b/i;
const AVOID_AFTER_CONDITION = /\b(?:while|when|if)\s+(?:(?:you|patients?)\s+(?:are\s+)?)?(?:taking|using|receiving)\b[^,;]+,\s*avoid\s+([^.;]+)/i;
// A generic insulin warning can apply to an analogue. Require administration
// wording, and a standalone class noun rather than a lab measure or a named analogue.
const INSULIN_CONTEXT = /\b(?:with|taking|using|receiving|administered|dose of|use of|or|plus)\s+(?:an?\s+)?$/i;
const INSULIN_END = /^\s*(?:$|[),.;:\]]|\b(?:may|might|can|could|should|must|is|are|increases?|raises?|to (?:reduce|avoid)|and|or)\b)/i;
const KIND_RANK: Readonly<Record<InteractionMatchKind, number>> = {
  ingredient_name: 0,
  common_name: 1,
  class_name: 2,
  class_phrase: 3,
};

interface CompiledTerm extends SearchTerm {
  readonly pattern: RegExp;
  // The label's own drug is in this group, so the word may mean the label's drug itself.
  readonly sharedWithOwner?: boolean;
}

interface FoundMatch {
  readonly text: string;
  readonly kind: InteractionMatchKind;
  readonly ingredient: string;
}

interface SentenceMatch {
  readonly sentence: LabelSentence;
  readonly sentenceIndex: number;
  readonly span: TextSpan;
  readonly found: FoundMatch;
  readonly match: TermMatch;
  readonly serious: boolean;
  readonly drugClass?: DrugClass;
  readonly mechanism?: MechanismTerm;
}

export function isAboutCoUse(sentence: LabelSentence): boolean {
  return CO_USE_SECTIONS.includes(sentence.section) || CO_USE_CUE.test(sentence.text);
}

function termsAbout(other: CabinetItem, labelOwner: CabinetItem): readonly CompiledTerm[] {
  const ownNames = new Set(labelOwner.ingredients.map((ingredient) => ingredient.name.toLowerCase()));
  const ownGroups = new Set(labelOwner.ingredients.flatMap(searchTermsFor)
    .filter((term) => term.kind === "class_name" || term.kind === "class_phrase")
    .map((term) => term.term.toLowerCase()));
  // Clinical mechanism rows describe systemic exposure. Local-only NDC products
  // (e.g. ketoconazole shampoo) should not inherit the systemic drug's warning.
  const localOnly = other.routes?.length && other.routes.every((route) =>
    /^(?:topical|cutaneous|ophthalmic|otic(?: \(auricular\))?|auricular(?: \(otic\))?|nasal|dental|periodontal|irrigation)$/i.test(route));
  return other.ingredients
    .filter((ingredient) => other.kind !== "supplement" || !isNutritionIngredient(ingredient))
    .filter((ingredient) => !ownNames.has(ingredient.name.toLowerCase()))
    // A trace mineral in a multivitamin is not a potassium supplement.
    .filter((ingredient) => !(other.kind === "supplement" && other.ingredients.length > 2 && /^(?:potassium|niacin|nicotinic acid|niacinamide)\b/i.test(ingredient.name)))
    .flatMap(searchTermsFor)
    // A product used only on the skin, eye or ear does not carry its drug group's systemic interactions.
    .filter((term) => !localOnly || term.kind === "ingredient_name" || term.kind === "common_name")
    // An electrolyte in a combination drug (for example, a bowel preparation)
    // does not establish that the product is used for potassium supplementation.
    .filter((term) => term.mechanism?.term !== "potassium supplement" || other.kind === "supplement" || other.ingredients.length === 1)
    .map((term) => ({
      ...term,
      pattern: new RegExp((term.mechanism?.pattern ?? termRegExp(term.term)).source, "gi"),
      ...(!term.mechanism && (term.kind === "class_name" || term.kind === "class_phrase") && ownGroups.has(term.term.toLowerCase())
        ? { sharedWithOwner: true } : {}),
    }));
}

function describesOwner(before: string, after: string, owner: CabinetItem): boolean {
  if (/\bthis\s+$/i.test(before)) return true;
  const example = /^\s*(?:[(,]\s*)?(?:such as|including|e\.g\.,?)\s+(.+?)(?:[,.);]|\s+(?:may|can|could|will|increase\w*|decrease\w*|reduce\w*)\b|$)/i.exec(after);
  if (example?.[1] && !CO_USE_CUE.test(before) && namesLabelOwner(example[1], owner)) return true;
  const predicate = /\s+(?:is|are|acts? as)\s+(?:also\s+)?(?:an?\s+)?$/i.exec(before);
  if (!predicate) return false;
  const subject = before.slice(0, predicate.index);
  return /\b(?:it|this (?:product|medicine|medication|drug))$/i.test(subject) ||
    [owner.displayName, ...owner.ingredients.map((ingredient) => ingredient.name)]
      .some((name) => new RegExp(termRegExp(name).source + "$", "i").test(subject));
}

// Drugs that labels often warn about in sentences of their own. When one of them is the subject and neither
// product contains it, a drug group word in that sentence is about the third drug.
const THIRD_DRUGS = /\b(lithium|digoxin|rilpivirine|gemfibrozil|methotrexate|aliskiren|cyclosporine|tacrolimus|theophylline|dofetilide|pimozide|thioridazine|cisapride|colchicine|warfarin)\b/i;

function namesThirdDrug(text: string, owner: CabinetItem, otherIngredient: string): boolean {
  const named = THIRD_DRUGS.exec(text)?.[1]?.toLowerCase();
  if (!named) return false;
  const inPair = [...owner.ingredients.map((ingredient) => ingredient.name), otherIngredient]
    .some((name) => name.toLowerCase().includes(named));
  return !inPair;
}

function firstAllowedSpan(text: string, term: CompiledTerm, owner: CabinetItem): TextSpan | undefined {
  return [...text.matchAll(term.pattern)]
    .map((hit) => ({ start: hit.index, end: hit.index + hit[0].length }))
    .find((span) => {
      const before = text.slice(0, span.start);
      const after = text.slice(span.end);
      if (term.notFollowedBy?.test(after)) return false;
      if (term.mechanism && !mechanismSpanAllowed(text, span.start, span.end, term.mechanism)) return false;
      // "Lithium should not be given with diuretics" on a diuretic's label is about lithium and this drug,
      // not about this drug and another diuretic.
      if (term.sharedWithOwner && namesThirdDrug(before, owner, term.ingredient)) return false;
      if (term.kind === "class_name" || term.kind === "class_phrase") {
        // Appositives classify the named drug in a study or explain the label owner's activity.
        if (describesOwner(before, after, owner) || /(?:^as |[,(]\s*)(?:an? )$/i.test(before)) return false;
        // "the antiplatelet activity of clopidogrel" describes an effect, not a second drug.
        if (/^\s+(?:activity|activities|effects?|action|properties)\b/i.test(after)) return false;
      }
      // A qualifier restricts the population even when an older, broader class alias matches.
      if (/^diuretics?$/i.test(term.term) && /\bpotassium[- ](?:sparing|retaining)\s+$/i.test(before)) return false;
      if (/^potassium$/i.test(term.term) && /^[- ](?:sparing|retaining|channels?)\b/i.test(after)) return false;
      if (/^potassium$/i.test(term.term) && /\b(?:serum|plasma|blood)\s+$/i.test(before)) return false;
      // "Calcium Channel Blockers" is a drug group, not calcium.
      if (/^calcium\b/i.test(term.term) && /^\s*[- ]?channel\b/i.test(after)) return false;
      // "aluminum or magnesium antacids" does not cover a calcium antacid.
      if (/^antacids?$/i.test(term.term) && /\b(?:aluminum|aluminium|magnesium)(?:[- ]containing)?\s+(?:(?:or|and)\s+(?:aluminum|aluminium|magnesium)(?:[- ]containing)?\s+)?$/i.test(before) &&
          !/aluminum|aluminium|magnesium/i.test(term.ingredient)) return false;
      // "losartan potassium" is the owner's own salt name, not a potassium product.
      if (/^(?:potassium|sodium|calcium|magnesium)$/i.test(term.term) &&
          owner.ingredients.some((ingredient) => new RegExp(`\\b${escapeRegExp(ingredient.name.split(/\s+/)[0] ?? "")}\\s+$`, "i").test(before))) return false;
      if (/^insulins?$/i.test(term.term)) {
        return INSULIN_CONTEXT.test(text.slice(0, span.start)) && INSULIN_END.test(after);
      }
      return true;
    });
}

function namesLabelOwner(text: string, owner: CabinetItem): boolean {
  return /\bthis (?:product|medicine|medication|drug)\b/i.test(text) ||
    [owner.displayName, ...owner.ingredients.map((ingredient) => ingredient.name)].some((name) => termRegExp(name).test(text));
}

// On a blood thinner's own label, a higher bleeding risk with another product is a serious harm.
const BLOOD_THINNER = /^(?:warfarin|apixaban|rivaroxaban|dabigatran|edoxaban|heparin|enoxaparin)\b/i;
const BLEEDING_RISK = /\b(?:increase[sd]?|raise[sd]?|higher)\b[^.;]{0,40}\brisk of (?:serious |major )?bleeding\b|\bbleeding risk\b/i;

function matchesIn(sentence: LabelSentence, sentenceIndex: number, terms: readonly CompiledTerm[], owner: CabinetItem): readonly SentenceMatch[] {
  const matches: SentenceMatch[] = [];
  const ownerThinsBlood = owner.ingredients.some((ingredient) => BLOOD_THINNER.test(ingredient.name));
  // Commas often separate members of a drug list under a single warning.
  let nextOffset = 0;
  for (const text of sentence.text.split(CLAUSE_BREAK)) {
    const offset = sentence.text.indexOf(text, nextOffset);
    nextOffset = offset + text.length;
    // "... compared to monotherapy" states the extra risk of the pair, it is not a study comparison.
    if (ALLERGY.test(text) || UNRESOLVED_POLARITY.test(text.replace(PROHIBITION, "").replace(/\bcompared (?:to|with) monotherapy\b/gi, ""))) continue;
    const harm = SERIOUS_HARM.exec(text);
    // "avoid alcoholic drinks" is about alcohol, not about the other product named in the same line.
    const prohibition = AVOID_COMBINATION.test(text.replace(/\bto avoid\b/gi, "").replace(/\bavoid (?:alcoholic (?:drinks|beverages)|alcohol)\b/gi, ""));
    if (harm && !prohibition && RISK_REDUCTION.test(text.slice(0, harm.index))) continue;
    const hasCoUseCue = CO_USE_CUE.test(text) || prohibition;
    const coUse = hasCoUseCue || sentence.section === "drug_interactions";
    const serious = Boolean(harm) || prohibition || (ownerThinsBlood && BLEEDING_RISK.test(text) && !/\bTable \d|\bCYP\d/i.test(sentence.text)) ||
      sentence.drugFactsInstruction === "do_not_use" || sentence.section === "do_not_use";
    const instruction = (coUse && WARNING.test(text)) || (hasCoUseCue && serious) ||
      (sentence.section === "ask_doctor_or_pharmacist" && hasCoUseCue) ||
      (/\b(?:the chances? (?:is|are) higher if|risk is (?:higher|increased) (?:if|with|when))\b/i.test(text) && hasCoUseCue);
    if (!instruction) continue;
    const otherTarget = AVOID_OTHER_TARGET.exec(text);
    const afterCondition = AVOID_AFTER_CONDITION.exec(text);
    for (const term of terms) {
      const local = firstAllowedSpan(text, term, owner);
      if (!local) continue;
      if (otherTarget?.[1] && local.start >= otherTarget.index + otherTarget[0].length && !namesLabelOwner(otherTarget[1], owner)) continue;
      if (afterCondition?.[1] && local.end <= afterCondition.index + afterCondition[0].indexOf(",") && !namesLabelOwner(afterCondition[1], owner)) continue;
      const span = { start: offset + local.start, end: offset + local.end };
      const found = { text: text.slice(local.start, local.end), kind: term.kind, ingredient: term.ingredient };
      matches.push({ sentence, sentenceIndex, span, found, serious, match: { ...found, term: term.term },
        ...(term.mechanism ? { mechanism: term.mechanism } : {}),
        ...(term.drugClass ? { drugClass: term.drugClass } : {}) });
    }
  }
  return matches;
}

function bestMatch(matches: readonly SentenceMatch[]): SentenceMatch | undefined {
  return matches.reduce<SentenceMatch | undefined>((best, candidate) => {
    if (best === undefined) return candidate;
    if (candidate.serious !== best.serious) return candidate.serious ? candidate : best;
    if (candidate.found.kind.startsWith("class_") && best.found.kind.startsWith("class_") &&
        Boolean(candidate.mechanism) !== Boolean(best.mechanism)) return candidate.mechanism ? candidate : best;
    const rankGap = KIND_RANK[candidate.found.kind] - KIND_RANK[best.found.kind];
    const isBetter = rankGap < 0 || (rankGap === 0 && candidate.sentenceIndex < best.sentenceIndex);
    return isBetter ? candidate : best;
  }, undefined);
}

function linkFor(other: CabinetItem, best: SentenceMatch): string {
  const match = best.found;
  if (match.kind === "ingredient_name") return `names ${match.ingredient}, which is in ${other.displayName}`;
  if (match.kind === "common_name") {
    return `names "${match.text}". ${other.displayName} lists ${match.ingredient} under that name`;
  }
  if (best.mechanism) return `mentions "${match.text}". ${other.displayName} contains ${match.ingredient}`;
  return `mentions "${match.text}". ${other.displayName} contains ${match.ingredient}, which RxClass lists in that drug group`;
}

function describe(labelOwner: CabinetItem, other: CabinetItem, section: LabelSectionName, match: SentenceMatch): string {
  const where = `the "${sectionTitle(section)}" section of the ${labelOwner.displayName} label`;
  return `${where.charAt(0).toUpperCase()}${where.slice(1)} ${linkFor(other, match)}. Ask a pharmacist or doctor before taking both.`;
}

function explain(labelOwner: CabinetItem, other: CabinetItem, match: FoundMatch): string {
  const named = match.kind === "ingredient_name" ? match.ingredient : `"${match.text}"`;
  return `The ${labelOwner.displayName} label mentions ${named} in this warning, so ask a pharmacist whether it applies to taking ${other.displayName} with it.`;
}

// RxClass names a group by chemistry or mechanism. Say what a person would call it first.
const PLAIN_GROUP_NAMES: readonly (readonly [RegExp, string])[] = [
  [/vitamin k antagonist|direct factor xa|direct thrombin|anticoagulant|heparin group/i, "the blood thinners"],
  [/platelet aggregation inhibitor|p2y12/i, "the blood thinners that act on platelets"],
  [/propionic acid|acetic acid derivatives|oxicams|nonsteroidal anti-inflammatory|coxibs/i, "the NSAID pain relievers"],
  [/salicylic acid/i, "the aspirin family of pain relievers"],
  [/selective serotonin reuptake|serotonin reuptake inhibitor/i, "the SSRI antidepressants"],
  [/hmg.?coa reductase/i, "the statins"],
  [/macrolide/i, "the macrolide antibiotics"],
  [/fluoroquinolone/i, "the fluoroquinolone antibiotics"],
  [/ace inhibitors|angiotensin.converting enzyme/i, "the ACE inhibitor blood pressure medicines"],
  [/benzodiazepine/i, "the benzodiazepine sedatives"],
  [/opioid|opium alkaloid|natural opium/i, "the opioid pain medicines"],
  [/monoamine oxidase/i, "the MAOI antidepressants"],
  [/proton pump/i, "the stomach acid reducers called PPIs"],
  [/corticosteroid|glucocorticoid/i, "the steroid medicines"],
  [/thiazide|sulfonamides, plain|high-ceiling diuretic|loop diuretic|potassium-sparing/i, "the diuretics, or water pills"],
  [/antihistamine/i, "the antihistamines"],
];

function classExplanation(other: CabinetItem, best: SentenceMatch): string | undefined {
  const { ingredient, text } = best.found;
  if (best.mechanism) {
    const term = best.mechanism.term;
    const counted = /s$/i.test(term) ? `one of the “${term}”` : `a “${term}”`;
    return `${other.displayName} contains ${ingredient}, which counts as ${counted} this label warns about. Source: ${best.mechanism.source}.`;
  }
  if (!best.drugClass) return undefined;
  // This OTC warning identifies a particular member by name. Make the distinction
  // explicit without applying a bare mention of warfarin to other anticoagulants.
  if (/^blood[- ]thinning$/i.test(text) && /^\s+drug\s+warfarin\b/i.test(best.sentence.text.slice(best.span.end))) {
    return `${other.displayName} contains ${ingredient}, a blood thinner. The label names warfarin, another blood thinner.`;
  }
  const plain = PLAIN_GROUP_NAMES.find(([pattern]) => pattern.test(best.drugClass?.name ?? ""))?.[1];
  const group = plain ? `${plain} (the drug group “${best.drugClass.name}”)` : `the drug group “${best.drugClass.name}”`;
  return `${other.displayName} contains ${ingredient}, which is one of ${group}. The label warns about “${text}”. Source: RxClass (${best.drugClass.source}).`;
}

// OTC Drug Facts often puts the consequence just before "The chance is higher if".
// Keep that antecedent only when the two lines are contiguous on this label.
function withBleedingContext(match: SentenceMatch, previous: LabelSentence | undefined, paragraphs: readonly string[]): SentenceMatch {
  if (!previous || !/^The (?:chances? (?:is|are)|risk is) (?:higher|increased)\b/i.test(match.sentence.text) ||
      !(/\bmay cause (?:severe|serious) stomach bleeding\.$/i.test(previous.text) || SERIOUS_HARM.test(previous.text))) return match;
  const end = match.sentence.text.search(/\s+(?:heart attack and stroke|allergy) (?:warning|alert)\b/i);
  const risks = end < 0 ? match.sentence.text : match.sentence.text.slice(0, end);
  const warningStart = previous.text.search(/\bstomach bleeding warning\b/i);
  const lead = warningStart > 0 ? previous.text.slice(warningStart) : previous.text;
  const text = `${lead} ${risks}`;
  if (match.span.end > risks.length || !paragraphs.some((paragraph) => paragraph.includes(text))) return match;
  const offset = lead.length + 1;
  return { ...match, serious: true, sentence: { ...match.sentence, text }, span: { start: offset + match.span.start, end: offset + match.span.end } };
}

// The table establishes membership. If the other label independently states the
// same mechanism as a complete sentence, show that product's wording as well.
function membershipQuote(other: CabinetItem, best: SentenceMatch) {
  if (!best.mechanism) return undefined;
  const assertion = new RegExp(`${termRegExp(best.found.ingredient).source} is an? (${best.mechanism.pattern.source})[.]?$`, "i");
  // openFDA can flatten the preceding SPL section heading into this sentence.
  const substrateHeading = /^(?:\d+(?:\.\d+)*\s+)?(?:effects of [\w -]+ on other drugs\s+)?(?:certain )?CYP\w+ substrates?$/i;
  const needsStrong = best.mechanism.term.startsWith("strong ");
  for (const sentence of sectionSentences(other.label, "drug_interactions")) {
    const hit = assertion.exec(sentence.text);
    if (!hit?.[1] || (needsStrong && !/^(?:strong|potent)\b/i.test(hit[1])) || /\bmoderate\b/i.test(hit[1])) continue;
    const prefix = sentence.text.slice(0, hit.index).trim();
    if (prefix === "" || substrateHeading.test(prefix)) return toQuote(other.id, { ...sentence, text: hit[0] });
  }
  return undefined;
}

const EXAMPLES_LEAD = /^(?:examples?(?: of [^:.]{1,80}?)?(?: include)?\s*:?|e\.g\.,?|such as|these (?:include|drugs include|are)|this includes)\s/i;
const REFERS_BACK = /^(?:therefore|thus|hence|in such cases),?\s/i;
const LIST_ITEM_MAX = 160;
const FOLLOW_ON = /^(?:administer|take|separate|space|give)\b[^.]*\bthese (?:agents|drugs|products|medications|medicines)\b/i;

function squash(text: string): string {
  return text.replace(/\s+/g, " ");
}

function inParagraph(paragraphs: readonly string[], parts: readonly string[]): boolean {
  return paragraphs.some((paragraph) => {
    const flat = squash(paragraph);
    let from = 0;
    for (const part of parts) {
      const at = flat.indexOf(squash(part), from);
      if (at < 0) return false;
      from = at + part.length;
    }
    return true;
  });
}

// Labels put the warning in one sentence and the drugs it covers in an
// "Examples include" line or a bulleted list after a colon. Read them together.
function leadInFor(sentences: readonly LabelSentence[], index: number): LabelSentence | undefined {
  const sentence = sentences[index];
  if (sentence === undefined) return undefined;
  if (EXAMPLES_LEAD.test(sentence.text) || REFERS_BACK.test(sentence.text)) return sentences[index - 1];
  for (let back = index - 1; back >= Math.max(0, index - 12); back -= 1) {
    const candidate = sentences[back];
    if (candidate === undefined) return undefined;
    if (candidate.text.trimEnd().endsWith(":")) return candidate;
    if (candidate.text.length > LIST_ITEM_MAX || /[.!?]$/.test(candidate.text.trim())) return undefined;
  }
  return undefined;
}

function withLeadIns(sentences: readonly LabelSentence[], paragraphs: readonly string[]): readonly LabelSentence[] {
  return sentences.map((sentence, index) => {
    const lead = index > 0 && sentence.text.length <= 600 ? leadInFor(sentences, index) : undefined;
    const next = sentences[index + 1];
    const follow = next && FOLLOW_ON.test(next.text) && inParagraph(paragraphs, [sentence.text, next.text]) ? next : undefined;
    const parts = [lead && inParagraph(paragraphs, [lead.text, sentence.text]) ? lead.text : undefined, sentence.text, follow?.text]
      .filter((part): part is string => part !== undefined);
    return parts.length === 1 ? sentence : { ...sentence, text: parts.join(" ") };
  });
}

const EXEMPT = /\bno (?:dose|dosage) adjustment (?:is )?(?:necessary|needed|required)|\bno clinically (?:significant|relevant|meaningful)\b/i;

// A label can warn about a drug group, then exempt one member by name.
function exemptionFor(sentences: readonly LabelSentence[], ingredient: string): LabelSentence | undefined {
  const named = termRegExp(ingredient);
  return sentences.find((sentence) => named.test(sentence.text) && EXEMPT.test(sentence.text));
}

function flagForSection(
  labelOwner: CabinetItem,
  other: CabinetItem,
  section: LabelSectionName,
  terms: readonly CompiledTerm[],
): readonly Flag[] {
  const sentences = withLeadIns(sectionSentences(labelOwner.label, section), labelOwner.label?.[section] ?? []);
  const matches = sentences.flatMap((sentence, index) =>
    matchesIn(sentence, index, terms, labelOwner).map((match) =>
      withBleedingContext(match, sentences[index - 1], labelOwner.label?.[section] ?? [])),
  );
  const best = bestMatch(matches);
  if (best === undefined) return [];
  const exemption = best.mechanism ? exemptionFor(sentences, best.found.ingredient) : undefined;
  if (exemption) {
    return [{
      type: "interaction",
      severity: "info",
      itemIds: [labelOwner.id, other.id],
      title: `${labelOwner.displayName} and ${other.displayName}`,
      detail: `The ${labelOwner.displayName} label names ${best.found.ingredient} and says no dose change is needed.`,
      explain: `The ${labelOwner.displayName} label warns about a drug group that includes ${best.found.ingredient}, then says this one needs no dose change.`,
      quote: toQuote(labelOwner.id, exemption),
      match: best.match,
    }];
  }
  const matchedBecause = classExplanation(other, best);
  const supportingQuote = membershipQuote(other, best);
  const quote = toQuote(labelOwner.id, best.sentence, best.span);
  // When the named drug and serious consequence are far apart, preserve both.
  const showsDanger = SERIOUS_HARM.test(quote.excerpt) || AVOID_COMBINATION.test(quote.excerpt);
  const needsFullWarning = best.serious && !showsDanger && (SERIOUS_HARM.test(quote.text) || AVOID_COMBINATION.test(quote.text));
  return [
    {
      type: "interaction",
      severity: best.serious ? "stop" : severityForSection(section),
      itemIds: [labelOwner.id, other.id],
      title: `${labelOwner.displayName} and ${other.displayName}`,
      detail: describe(labelOwner, other, section, best),
      explain: explain(labelOwner, other, best.found),
      quote: needsFullWarning ? { ...quote, excerpt: quote.text } : quote,
      ...(supportingQuote ? { supportingQuotes: [supportingQuote] } : {}),
      match: best.match,
      ...(matchedBecause ? { matchedBecause } : {}),
    },
  ];
}

function flagsForPair(labelOwner: CabinetItem, other: CabinetItem): readonly Flag[] {
  const terms = termsAbout(other, labelOwner);
  if (terms.length === 0) return [];
  const flags = INTERACTION_SECTIONS.flatMap((section) => flagForSection(labelOwner, other, section, terms));
  // Older labels repeat the Drug interactions text inside Precautions.
  return flags.filter((flag, index) =>
    flags.findIndex((earlier) => squash(earlier.quote?.text ?? "") === squash(flag.quote?.text ?? "")) === index);
}

const INR_WITH_BOTANICALS = /\bINR monitoring\b[^.]*\bbotanicals?\b/i;

// The warfarin label asks for closer INR checks when any botanical is started or stopped, without naming each one.
function warfarinSupplementFlag(labelOwner: CabinetItem, other: CabinetItem): Flag | undefined {
  if (other.kind !== "supplement" || !labelOwner.ingredients.some((ingredient) => /^warfarin\b/i.test(ingredient.name))) return undefined;
  const sentence = (["drug_interactions", "warnings_and_cautions"] as const)
    .flatMap((section) => sectionSentences(labelOwner.label, section))
    .find((candidate) => INR_WITH_BOTANICALS.test(candidate.text));
  if (!sentence) return undefined;
  const explain = `The ${labelOwner.displayName} label asks for more frequent INR blood tests when any herbal or dietary supplement is started or stopped.`;
  return {
    type: "interaction", severity: "ask", itemIds: [labelOwner.id, other.id],
    title: `${labelOwner.displayName} and ${other.displayName}`,
    detail: explain, explain, quote: toQuote(labelOwner.id, sentence),
  };
}

export function interactionFlags(items: readonly CabinetItem[]): readonly Flag[] {
  const named = items.flatMap((labelOwner) =>
    items.filter((other) => other.id !== labelOwner.id).flatMap((other) => flagsForPair(labelOwner, other)),
  );
  const pairs = new Set(named.map((flag) => [...flag.itemIds].sort().join("+")));
  const general = items.flatMap((labelOwner) => items
    .filter((other) => other.id !== labelOwner.id && !pairs.has([labelOwner.id, other.id].sort().join("+")))
    .flatMap((other) => warfarinSupplementFlag(labelOwner, other) ?? []));
  return [...named, ...general];
}
