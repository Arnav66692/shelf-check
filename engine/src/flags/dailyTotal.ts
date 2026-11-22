import { sectionSentences, sentencesIn, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { PER_EACH_UNIT } from "../sources/openfda.ts";
import { escapeRegExp, formatNumber, termRegExp } from "../text.ts";
import type {
  CabinetItem,
  DailyServings,
  Flag,
  FlagNumbers,
  Ingredient,
  LabelSectionName,
  Quote,
  Severity,
} from "../types.ts";
import { findDuplicatedIngredients } from "./duplicates.ts";
import type { DuplicatedIngredient, IngredientMember } from "./duplicates.ts";

const NUMBER = "\\d+(?:\\.\\d+)?";
const SOLID_UNITS = "tablets?|caplets?|capsules?|gelcaps?|geltabs?|softgels?|liquid[- ]?gels?|lozenges?";
const VOLUME_UNITS = "mL|milliliters?|teaspoons?(?:ful)?|tablespoons?(?:ful)?";
const DOSE_SIZE_UNITS = `${SOLID_UNITS}|${VOLUME_UNITS}`;
const LIMIT_UNITS = `${DOSE_SIZE_UNITS}|doses?`;
const ONE_DAY = "(?:24[- ]?(?:hours?|hrs?)|day)(?![A-Za-z])";
const LIMIT_LEAD_IN =
  "(?:do not (?:take|use|give) more than|do not exceed|not to exceed|not more than|no more than|maximum of)";
const LIMIT_PATTERN = new RegExp(
  `${LIMIT_LEAD_IN}\\s+(${NUMBER})\\s+(${LIMIT_UNITS})(?:\\s+of this product)?\\s+(?:in|per|every|within)\\s+(?:any\\s+|a\\s+)?${ONE_DAY}`,
  "gi",
);
const PER_DOSE_PATTERN = new RegExp(`(${NUMBER})\\s*(${DOSE_SIZE_UNITS})\\s+(?:per|each|in each)\\s+dose`, "i");
const ADULT_DOSE_PATTERN = new RegExp(
  `adults?\\s+(?:and|&)\\s+children\\s+12\\s+(?:years|yrs?\\.?)(?:\\s+of\\s+age)?\\s+(?:and|&|or)\\s+(?:over|older):?\\s+(?:take\\s+)?(${NUMBER})(?:\\s*(?:${DOSE_SIZE_UNITS}))?(?:\\s+(?:to|or)\\s+(${NUMBER}))?\\s*(${DOSE_SIZE_UNITS})`,
  "i",
);
const AMOUNT = "\\d[\\d,]*(?:\\.\\d+)?";
const MASS_UNITS = "mg|milligrams?|g|grams?";
const MAXIMUM_DAILY_MASS_PATTERN = new RegExp(
  `maximum daily (?:dose|dosage|amount)[^.]{0,80}?(${AMOUNT})\\s*(${MASS_UNITS})(?![A-Za-z])`,
  "i",
);

const DIRECTIONS_SECTION: LabelSectionName = "dosage_and_administration";
const DOSE_SIZE_SECTIONS: readonly LabelSectionName[] = [DIRECTIONS_SECTION, "warnings"];
const CEILING_SECTIONS: readonly LabelSectionName[] = ["warnings", "boxed_warning", DIRECTIONS_SECTION];

const MG_PER_MASS_UNIT: Readonly<Record<string, number>> = {
  mg: 1,
  milligram: 1,
  g: 1000,
  gram: 1000,
  ug: 0.001,
  mcg: 0.001,
};
const ML_PER_VOLUME_UNIT: Readonly<Record<string, number>> = { ml: 1, milliliter: 1, teaspoon: 5, tablespoon: 15 };
const DOSE_UNIT = "dose";

export interface LabelAmount {
  readonly value: number;
  readonly unit: string;
  readonly matchedText: string;
  readonly quote: Quote;
}

export type LabelledMaximum =
  | {
      readonly status: "parsed";
      readonly mgPerDay: number;
      readonly limit: LabelAmount;
      readonly doseSize?: LabelAmount;
      readonly servings?: DailyServings;
      readonly limitsFound: number;
    }
  | { readonly status: "not_parsed"; readonly reason: string };

type Conversion = { readonly ok: true; readonly mg: number } | { readonly ok: false; readonly reason: string };

function singular(rawUnit: string): string {
  return rawUnit
    .toLowerCase()
    .replace(/s$/, "")
    .replace(/ful$/, "")
    .replace(/[- ]/g, "");
}

function toNumber(raw: string): number {
  return Number(raw.replaceAll(",", ""));
}

function quoteAt(item: CabinetItem, sentence: LabelSentence, matchedText: string, index: number): Quote {
  return toQuote(item.id, sentence, { start: index, end: index + matchedText.length });
}

function strengthMg(ingredient: Ingredient): Conversion {
  const factor = MG_PER_MASS_UNIT[ingredient.unit.toLowerCase()];
  return factor === undefined
    ? { ok: false, reason: `the strength unit "${ingredient.unit}" cannot be converted to mg` }
    : { ok: true, mg: ingredient.value * factor };
}

function mgIn(amount: number, rawUnit: string, ingredient: Ingredient): Conversion {
  const strength = strengthMg(ingredient);
  if (!strength.ok) return strength;
  const per = ingredient.per ?? { value: 1, unit: PER_EACH_UNIT };
  const unit = singular(rawUnit);
  const mlPerUnit = ML_PER_VOLUME_UNIT[unit];
  if (mlPerUnit === undefined) {
    return per.unit === PER_EACH_UNIT
      ? { ok: true, mg: (amount * strength.mg) / per.value }
      : { ok: false, reason: `the label counts ${rawUnit} but the strength is per ${per.value} ${per.unit}` };
  }
  const mlPerStrength = ML_PER_VOLUME_UNIT[singular(per.unit)];
  return mlPerStrength === undefined
    ? { ok: false, reason: `the label measures ${rawUnit} but the strength is per ${per.value} ${per.unit}` }
    : { ok: true, mg: (amount * mlPerUnit * strength.mg) / (per.value * mlPerStrength) };
}

function findLimits(item: CabinetItem): readonly LabelAmount[] {
  return sectionSentences(item.label, DIRECTIONS_SECTION).flatMap((sentence) =>
    [...sentence.text.matchAll(LIMIT_PATTERN)].flatMap((match) => {
      const [matchedText, rawValue, unit] = match;
      return rawValue === undefined || unit === undefined
        ? []
        : [{ value: toNumber(rawValue), unit, matchedText, quote: quoteAt(item, sentence, matchedText, match.index) }];
    }),
  );
}

function doseSizeIn(item: CabinetItem, sentence: LabelSentence): LabelAmount | undefined {
  const perDose = PER_DOSE_PATTERN.exec(sentence.text);
  if (perDose?.[1] !== undefined && perDose[2] !== undefined) {
    const quote = quoteAt(item, sentence, perDose[0], perDose.index);
    return { value: toNumber(perDose[1]), unit: perDose[2], matchedText: perDose[0], quote };
  }
  const adult = ADULT_DOSE_PATTERN.exec(sentence.text);
  if (adult?.[1] === undefined || adult[3] === undefined) return undefined;
  const upperBound = Math.max(toNumber(adult[1]), adult[2] === undefined ? 0 : toNumber(adult[2]));
  return { value: upperBound, unit: adult[3], matchedText: adult[0], quote: quoteAt(item, sentence, adult[0], adult.index) };
}

function findDoseSize(item: CabinetItem): LabelAmount | undefined {
  return sentencesIn(item.label, DOSE_SIZE_SECTIONS)
    .map((sentence) => doseSizeIn(item, sentence))
    .find((doseSize) => doseSize !== undefined);
}

function resolveLimit(limit: LabelAmount, item: CabinetItem, ingredient: Ingredient, limitsFound: number): LabelledMaximum {
  if (singular(limit.unit) !== DOSE_UNIT) {
    const direct = mgIn(limit.value, limit.unit, ingredient);
    return direct.ok
      ? { status: "parsed", mgPerDay: direct.mg, limit, limitsFound }
      : { status: "not_parsed", reason: direct.reason };
  }
  const doseSize = findDoseSize(item);
  if (doseSize === undefined) {
    return { status: "not_parsed", reason: `the label limits doses ("${limit.matchedText}") but no dose size could be read` };
  }
  const perDose = mgIn(doseSize.value, doseSize.unit, ingredient);
  return perDose.ok
    ? { status: "parsed", mgPerDay: limit.value * perDose.mg, limit, doseSize, limitsFound }
    : { status: "not_parsed", reason: perDose.reason };
}

function maximumFromMassStatement(item: CabinetItem, ingredient: Ingredient): LabelledMaximum | undefined {
  const namesIngredient = termRegExp(ingredient.name);
  const isAboutIngredient = (sentence: LabelSentence): boolean =>
    item.ingredients.length === 1 || namesIngredient.test(sentence.text);
  return sectionSentences(item.label, DIRECTIONS_SECTION)
    .filter(isAboutIngredient)
    .flatMap((sentence): readonly LabelledMaximum[] => {
      const match = MAXIMUM_DAILY_MASS_PATTERN.exec(sentence.text);
      const factor = match?.[2] === undefined ? undefined : MG_PER_MASS_UNIT[singular(match[2])];
      if (match?.[1] === undefined || match[2] === undefined || factor === undefined) return [];
      const quote = quoteAt(item, sentence, match[0], match.index);
      const limit = { value: toNumber(match[1]), unit: match[2], matchedText: match[0], quote };
      return [{ status: "parsed", mgPerDay: limit.value * factor, limit, limitsFound: 1 }];
    })
    .at(0);
}

const SERVINGS_UNIT = "servings";

// A supplement label gives no "do not exceed" line. Its daily amount is the labelled servings per day, and
// only when the label record states them.
function amountFromDailyServings(item: CabinetItem, ingredient: Ingredient): LabelledMaximum {
  const servings = item.dailyServings;
  if (servings === undefined) return { status: "not_parsed", reason: "the supplement label does not give servings per day" };
  const [directions] = sectionSentences(item.label, DIRECTIONS_SECTION);
  if (directions === undefined) {
    return { status: "not_parsed", reason: "the supplement record has no directions text to quote for its servings per day" };
  }
  const strength = strengthMg(ingredient);
  if (!strength.ok) return { status: "not_parsed", reason: strength.reason };
  const per = ingredient.per;
  if (per === undefined || per.unit.toLowerCase() !== servings.unit.toLowerCase()) {
    return { status: "not_parsed", reason: `the amount is not stated per ${servings.unit}` };
  }
  const mgPerDay = (strength.mg / per.value) * servings.unitsPerServing * servings.servingsPerDay;
  const limit = {
    value: servings.servingsPerDay,
    unit: SERVINGS_UNIT,
    matchedText: directions.text,
    quote: toQuote(item.id, directions),
  };
  return { status: "parsed", mgPerDay, limit, servings, limitsFound: 1 };
}

export function labelledMaximum(item: CabinetItem, ingredient: Ingredient): LabelledMaximum {
  if (item.kind === "supplement") return amountFromDailyServings(item, ingredient);
  if (sectionSentences(item.label, DIRECTIONS_SECTION).length === 0) {
    return { status: "not_parsed", reason: "the label has no directions text" };
  }
  const limits = findLimits(item);
  if (limits.length === 0) {
    return (
      maximumFromMassStatement(item, ingredient) ?? {
        status: "not_parsed",
        reason: "no daily maximum sentence was found in the directions",
      }
    );
  }
  const resolved = limits.map((limit) => resolveLimit(limit, item, ingredient, limits.length));
  const parsed = resolved.flatMap((result) => (result.status === "parsed" ? [result] : []));
  const highest = parsed.reduce<(typeof parsed)[number] | undefined>(
    (best, result) => (best === undefined || result.mgPerDay > best.mgPerDay ? result : best),
    undefined,
  );
  return highest ?? resolved[0] ?? { status: "not_parsed", reason: "no daily maximum sentence was found in the directions" };
}

export interface LabelledCeiling {
  readonly mgPerDay: number;
  readonly matchedText: string;
  readonly quote: Quote;
}

export function labelledCeiling(item: CabinetItem, ingredientName: string): LabelledCeiling | undefined {
  const pattern = new RegExp(
    `more than\\s+(${AMOUNT})\\s*(${MASS_UNITS})\\s+of\\s+${escapeRegExp(ingredientName)}\\s+(?:in|per|within)\\s+(?:any\\s+|a\\s+)?${ONE_DAY}`,
    "i",
  );
  return sentencesIn(item.label, CEILING_SECTIONS)
    .flatMap((sentence): readonly LabelledCeiling[] => {
      const match = pattern.exec(sentence.text);
      const factor = match?.[2] === undefined ? undefined : MG_PER_MASS_UNIT[singular(match[2])];
      if (match?.[1] === undefined || factor === undefined) return [];
      const quote = quoteAt(item, sentence, match[0], match.index);
      return [{ mgPerDay: toNumber(match[1]) * factor, matchedText: match[0], quote }];
    })
    .at(0);
}

interface MemberMaximum {
  readonly member: IngredientMember;
  readonly maximum: LabelledMaximum;
}

type ParsedMaximum = Extract<LabelledMaximum, { status: "parsed" }>;

interface ParsedMember {
  readonly member: IngredientMember;
  readonly maximum: ParsedMaximum;
}

interface MemberCeiling {
  readonly member: IngredientMember;
  readonly ceiling: LabelledCeiling;
}

interface GroupTotals {
  readonly entries: readonly MemberMaximum[];
  readonly parsed: readonly ParsedMember[];
  readonly lowest: ParsedMember | undefined;
  readonly total: number | null;
  readonly ceiling: MemberCeiling | undefined;
  readonly isOverCeiling: boolean;
}

function lowestBy<T>(values: readonly T[], amountOf: (value: T) => number): T | undefined {
  return values.reduce<T | undefined>(
    (lowest, value) => (lowest === undefined || amountOf(value) < amountOf(lowest) ? value : lowest),
    undefined,
  );
}

function totalsFor(group: DuplicatedIngredient): GroupTotals {
  const entries = group.members.map((member) => ({ member, maximum: labelledMaximum(member.item, member.ingredient) }));
  const parsed = entries.flatMap((entry) =>
    entry.maximum.status === "parsed" ? [{ member: entry.member, maximum: entry.maximum }] : [],
  );
  const total =
    parsed.length === entries.length ? parsed.reduce((sum, entry) => sum + entry.maximum.mgPerDay, 0) : null;
  const ceilings = group.members.flatMap((member) => {
    const ceiling = labelledCeiling(member.item, group.name);
    return ceiling === undefined ? [] : [{ member, ceiling }];
  });
  const ceiling = lowestBy(ceilings, (entry) => entry.ceiling.mgPerDay);
  return {
    entries,
    parsed,
    lowest: lowestBy(parsed, (entry) => entry.maximum.mgPerDay),
    total,
    ceiling,
    isOverCeiling: total !== null && ceiling !== undefined && total > ceiling.ceiling.mgPerDay,
  };
}

function severityFor(totals: GroupTotals): Severity {
  if (totals.isOverCeiling) return "stop";
  return totals.parsed.length > 0 ? "ask" : "info";
}

function numbersFor(totals: GroupTotals): FlagNumbers {
  const perItem = totals.entries.map(
    (entry) =>
      [`maxMgPerDay.${entry.member.item.id}`, entry.maximum.status === "parsed" ? entry.maximum.mgPerDay : null] as const,
  );
  return {
    ...Object.fromEntries(perItem),
    lowestMaxMgPerDay: totals.lowest?.maximum.mgPerDay ?? null,
    totalMgPerDayAtEachMaximum: totals.total,
    labelWarningMgPerDay: totals.ceiling?.ceiling.mgPerDay ?? null,
  };
}

function describeMember(entry: MemberMaximum, ingredientName: string): string {
  const name = entry.member.item.displayName;
  if (entry.maximum.status === "not_parsed") {
    return `${name}: no daily maximum could be read from the label, because ${entry.maximum.reason}.`;
  }
  const { limit, doseSize, mgPerDay, limitsFound, servings } = entry.maximum;
  if (servings !== undefined) {
    return `${name}: the directions say "${limit.matchedText}" and the label record gives ${formatNumber(servings.unitsPerServing)} ${servings.unit} ${formatNumber(servings.servingsPerDay)} time(s) a day, which is ${formatNumber(mgPerDay)} mg of ${ingredientName} a day.`;
  }
  const dose = doseSize === undefined ? "" : ` with the dose size "${doseSize.matchedText}"`;
  const choice = limitsFound > 1 ? " The directions print more than one limit and the highest is used." : "";
  return `${name}: the label says "${limit.matchedText}"${dose}, which is ${formatNumber(mgPerDay)} mg of ${ingredientName} in 24 hours.${choice}`;
}

function detailFor(totals: GroupTotals, ingredientName: string): string {
  const lowestLine =
    totals.lowest === undefined
      ? []
      : [`The lowest labelled maximum is ${formatNumber(totals.lowest.maximum.mgPerDay)} mg.`];
  const totalLine =
    totals.total === null
      ? "A combined total cannot be worked out because at least one label maximum could not be read. Nothing was guessed."
      : `If each product were taken at its own labelled maximum, the total would be ${formatNumber(totals.total)} mg of ${ingredientName} in 24 hours.`;
  const over = totals.isOverCeiling ? " The combined total is above that amount." : "";
  const ceilingLine =
    totals.ceiling === undefined
      ? []
      : [`The ${totals.ceiling.member.item.displayName} label warns about "${totals.ceiling.ceiling.matchedText}".${over}`];
  return [
    ...totals.entries.map((entry) => describeMember(entry, ingredientName)),
    ...lowestLine,
    totalLine,
    ...ceilingLine,
    "Ask a pharmacist or doctor before taking these on the same day.",
  ].join(" ");
}

function explainFor(totals: GroupTotals, ingredientName: string): string {
  if (totals.total === null) {
    return `These products share ${ingredientName}, but the labels do not give enough to add up a daily amount.`;
  }
  const sum = `Taken at the most each label allows, these products add up to ${formatNumber(totals.total)} mg of ${ingredientName} a day`;
  return totals.isOverCeiling && totals.ceiling !== undefined
    ? `${sum}, which is more than the ${formatNumber(totals.ceiling.ceiling.mgPerDay)} mg a day that a label warns about.`
    : `${sum}.`;
}

function isSameQuote(left: Quote, right: Quote): boolean {
  return left.itemId === right.itemId && left.section === right.section && left.text === right.text;
}

function quotesFor(totals: GroupTotals): readonly Quote[] {
  const quotes = [
    ...totals.parsed.flatMap((entry) => [
      entry.maximum.limit.quote,
      ...(entry.maximum.doseSize === undefined ? [] : [entry.maximum.doseSize.quote]),
    ]),
    ...(totals.ceiling === undefined ? [] : [totals.ceiling.ceiling.quote]),
  ];
  return quotes.filter((quote, index) => quotes.findIndex((other) => isSameQuote(other, quote)) === index);
}

function toFlag(group: DuplicatedIngredient): Flag {
  const totals = totalsFor(group);
  const supportingQuotes = quotesFor(totals);
  return {
    type: "daily_total",
    severity: severityFor(totals),
    itemIds: group.members.map((member) => member.item.id),
    title: `${group.name} daily total across ${group.members.length} products`,
    detail: detailFor(totals, group.name),
    explain: explainFor(totals, group.name),
    numbers: numbersFor(totals),
    ...(totals.lowest === undefined ? {} : { quote: totals.lowest.maximum.limit.quote }),
    ...(supportingQuotes.length === 0 ? {} : { supportingQuotes }),
  };
}

export function dailyTotalFlags(items: readonly CabinetItem[]): readonly Flag[] {
  return findDuplicatedIngredients(items).map(toFlag);
}
