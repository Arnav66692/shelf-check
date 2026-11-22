import { labelStrengthBasis } from "../cabinet.ts";
import { sectionSentences, sentencesIn, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { PER_EACH_UNIT } from "../sources/openfda.ts";
import { escapeRegExp, formatNumber, splitSentences } from "../text.ts";
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
import type { HealthProfile } from "./profile.ts";
import type { DuplicatedIngredient, IngredientMember } from "./duplicates.ts";

const NUMBER = "(?:(?:\\d+\\s+)?\\d+/\\d+|\\d+(?:\\.\\d+)?)";
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
const DOSE_QUANTITY = `(${NUMBER})(?:\\s*(${DOSE_SIZE_UNITS})?\\s+(?:to|or)\\s+(${NUMBER}))?\\s*(${DOSE_SIZE_UNITS})\\b`;
const DOSE_PREFIX = "^\\s*(?:directions\\s*[:.]?\\s*)?(?:take\\s+)?";
const PER_DOSE = new RegExp(`${DOSE_PREFIX}${DOSE_QUANTITY}\\s+(?:per|each|in each)\\s+dose\\b`, "i");
const ROW_DOSE = new RegExp(`^\\s*(?:take\\s+)?${DOSE_QUANTITY}(?:\\s+(?:per|each)\\s+dose)?(?=\\s*(?:$|[.(;•]|every\\b|at\\b|do not\\b))`, "i");
const AMOUNT = "(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?";
const MASS_UNITS = "mg|milligrams?|g|grams?";
const MASS_CLAUSE = new RegExp(`^(?:(.+?)\\s+is\\s+|is\\s+)?(${AMOUNT})\\s*(${MASS_UNITS})(?:\\s*(?:/day|per day))?$`, "i");

const DIRECTIONS_SECTION: LabelSectionName = "dosage_and_administration";
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

type AgeProfile = Pick<HealthProfile, "ageYears">;

interface DirectionPart {
  readonly text: string;
  readonly paragraph: string;
  readonly offset: number;
  readonly isAgeRow: boolean;
}

const AUDIENCE = /\b(?:adults?\s+(?:and|&)\s+children|adults?|children|child|infants?|adolescents?|pediatric|neonates?)\b/gi;
const YEARS = "(?:years?|yrs?\\.?)(?:\\s+of\\s+age)?";
const OLDER = new RegExp(`^\\s*(\\d+)\\s+${YEARS}\\s+(?:and|or|&)\\s+(?:older|over)\\b`, "i");
const RANGE = new RegExp(`^\\s*(\\d+)\\s*(?:to|[-–])\\s*(under\\s+)?(\\d+)\\s+${YEARS}\\b`, "i");
const UNDER = new RegExp(`^\\s*under\\s+(\\d+)\\s+${YEARS}\\b`, "i");

function ageRange(text: string): { from: number; below: number; length: number } | undefined {
  const older = OLDER.exec(text);
  if (older) return { from: Number(older[1]), below: Infinity, length: older[0].length };
  const range = RANGE.exec(text);
  if (range) return { from: Number(range[1]), below: Number(range[3]) + (range[2] ? 0 : 1), length: range[0].length };
  const under = UNDER.exec(text);
  if (under) return { from: 0, below: Number(under[1]), length: under[0].length };
  return undefined;
}

function applicableDirections(paragraph: string, age: number | undefined): readonly DirectionPart[] | undefined {
  if (/\b(?:weigh(?:t|s|ing)?|kilograms?|kg|pounds?|lbs?|months?|newborns?|elderly|geriatric)\b/i.test(paragraph)) return undefined;
  const headings = [...paragraph.matchAll(AUDIENCE)];
  const first = headings[0];
  if (!first) {
    if (/\b(?:age[ds]?|years?|yrs?)\b/i.test(paragraph)) return undefined;
    return [{ text: paragraph, paragraph, offset: 0, isAgeRow: false }];
  }
  if (age === undefined || !Number.isFinite(age) || age < 0) return undefined;
  const common = { text: paragraph.slice(0, first.index), paragraph, offset: 0, isAgeRow: false };
  const selected: DirectionPart[] = [];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index + heading[0].length;
    const row = paragraph.slice(start, headings[index + 1]?.index);
    const range = ageRange(row);
    if (!range) return undefined;
    if (age >= range.from && age < range.below) {
      const body = row.slice(range.length).replace(/^[\s:]+/, "");
      if (/^(?:do not use|ask|consult)\b/i.test(body)) return undefined;
      selected.push({ text: body, paragraph, offset: start + row.length - body.length, isAgeRow: true });
    }
  }
  return selected.length === 1 ? [common, ...selected] : undefined;
}

function amountAt(
  item: CabinetItem, part: DirectionPart, text: string, offset: number, value: number, unit: string,
): LabelAmount {
  const index = part.offset + offset;
  let start = 0;
  for (const textOfSentence of splitSentences(part.paragraph)) {
    start = part.paragraph.indexOf(textOfSentence, start);
    if (index >= start && index + text.length <= start + textOfSentence.length) {
      const sentence = { section: DIRECTIONS_SECTION, text: textOfSentence };
      return { value, unit, matchedText: text, quote: quoteAt(item, sentence, text, index - start) };
    }
    start += textOfSentence.length;
  }
  return { value, unit, matchedText: text, quote: quoteAt(item, { section: DIRECTIONS_SECTION, text: part.text }, text, offset) };
}

function quantity(raw: string): number {
  const fraction = /^(?:(\d+)\s+)?(\d+)\/(\d+)$/.exec(raw);
  return fraction ? Number(fraction[1] ?? 0) + Number(fraction[2]) / Number(fraction[3]) : Number(raw);
}

function limitsIn(item: CabinetItem, part: DirectionPart): readonly LabelAmount[] {
  return [...part.text.matchAll(LIMIT_PATTERN)].flatMap((match) => {
    const [, raw, unit] = match;
    return raw && unit ? [amountAt(item, part, match[0], match.index, quantity(raw), unit)] : [];
  });
}

// openFDA flattens tables and bullets. Unread text around a cap may restrict
// its audience, change the quantity, or start another row.
const DIRECTION_PREFACE = /^(?:directions\b|do not take more than directed\b(?:\s*\(see overdose warning\s*\))?|the smallest effective dose should be used\b|drink a full glass of water with each dose\b|take only as directed\b|only use the dose cup provided\b|find right dose on chart below\b|ml\s*=\s*milliliter\b|take every \d+ to \d+ hours, or as directed by a doctor\b)/i;
const SEPARATORS = /^[\s:.,;•■▪●◦]+/;
const EVERY = "every\\s+\\d+(?:\\s+to\\s+\\d+)?\\s+(?:hours?|hrs?)";
const DOSE_SCHEDULE = new RegExp(
  `^(?:take\\s+)?${DOSE_QUANTITY}(?:\\s+(?:each|per|in each)\\s+dose)?` +
    `(?:\\s+(?:at bedtime|daily|${EVERY}(?:\\s+or\\s+${DOSE_QUANTITY}\\s+${EVERY})?))?` +
    "(?:\\s+while symptoms (?:last|persist))?", "i",
);
const CUP_NOTE = /^\(\d+x\d+ mL; Note: dosing cup needs to be filled to \d+ mL line twice for the \d+ mL dose\)/i;
const PAIN_FEVER_DIRECTION = /^if pain or fever does not respond to 1 capsule, 2 capsules may be used\b/i;
const CAP_SUFFIX = /^(?:unless directed by a doctor\b|do not use for more than \d+ days\b|age \(yr\) dose \(ml\))/i;

function stripPhrases(text: string, pattern: RegExp): string {
  let remaining = text.replace(SEPARATORS, "");
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(remaining))) {
    remaining = remaining.slice(match[0].length).replace(SEPARATORS, "");
  }
  return remaining;
}

function understoodCapContext(part: DirectionPart): boolean {
  const limits = [...part.text.matchAll(LIMIT_PATTERN)];
  if (limits.length > 1) return false;
  const [limit] = limits;
  if (limit) {
    const suffix = part.text.slice(limit.index + limit[0].length);
    if (stripPhrases(suffix, CAP_SUFFIX) !== "") return false;
  }
  let before = stripPhrases(part.text.slice(0, limit?.index), DIRECTION_PREFACE);
  if (!before) return true;
  const dose = DOSE_SCHEDULE.exec(before);
  if (!dose) return false;
  before = before.slice(dose[0].length).replace(SEPARATORS, "").trimEnd();
  return !before || (CUP_NOTE.exec(before)?.[0] === before) || (PAIN_FEVER_DIRECTION.exec(before)?.[0] === before);
}

function doseIn(item: CabinetItem, part: DirectionPart): LabelAmount | undefined {
  // A bare number is a dose only at the start of the selected dosage-table row.
  const pattern = part.isAgeRow ? ROW_DOSE : PER_DOSE;
  const match = pattern.exec(part.text);
  const [, lower, lowerUnit, upper, unit] = match ?? [];
  if (!match || !lower || !unit) return undefined;
  if (lowerUnit && singular(lowerUnit) !== singular(unit)) return undefined;
  const tail = part.text.slice(match[0].length);
  if (/\b(?:if|except|alternatively|instead|or|per dose|each dose|depending)\b/i.test(tail)) return undefined;
  const value = quantity(upper ?? lower);
  if (!(quantity(lower) > 0 && Number.isFinite(value) && value >= quantity(lower))) return undefined;
  const matched = match[0].trim();
  return amountAt(item, part, matched, part.text.indexOf(matched), value, unit);
}

function maximumFromMassStatement(item: CabinetItem, ingredient: Ingredient, part: DirectionPart): LabelledMaximum | undefined {
  const statement = /^(?:\s*(?:directions|dosage and administration)\s*[:.]?\s*)?\s*maximum daily (?:dose|dosage|amount)\s+(.+?)\.?\s*$/i.exec(part.text);
  if (!statement?.[1]) return undefined;
  const clauses = statement[1].replace(/^of\s+/i, "").split(/\s+and\s+/i);
  const basis = strengthBasisOf(item, ingredient);
  const found: LabelAmount[] = [];
  for (const clause of clauses) {
    const match = MASS_CLAUSE.exec(clause);
    if (!match?.[2] || !match[3]) return undefined;
    const name = match[1]?.trim().toLowerCase();
    if (name === undefined && (item.ingredients.length !== 1 || clauses.length !== 1)) return undefined;
    if (name !== undefined && !item.ingredients.some((candidate) => strengthBasisOf(item, candidate) === name)) return undefined;
    if (name === undefined || name === basis) {
      found.push(amountAt(item, part, clause, part.text.indexOf(clause), toNumber(match[2]), match[3]));
    }
  }
  const [limit] = found;
  const factor = limit && MG_PER_MASS_UNIT[singular(limit.unit)];
  if (found.length !== 1 || !limit || !factor) return undefined;
  const mgPerDay = limit.value * factor;
  return Number.isFinite(mgPerDay) && mgPerDay > 0 ? { status: "parsed", mgPerDay, limit, limitsFound: 1 } : undefined;
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
  if (!Number.isFinite(mgPerDay) || mgPerDay <= 0) return { status: "not_parsed", reason: "the serving quantity is invalid" };
  const limit = {
    value: servings.servingsPerDay,
    unit: SERVINGS_UNIT,
    matchedText: directions.text,
    quote: toQuote(item.id, directions),
  };
  return { status: "parsed", mgPerDay, limit, servings, limitsFound: 1 };
}

export function labelledMaximum(item: CabinetItem, ingredient: Ingredient, profile?: AgeProfile): LabelledMaximum {
  if (item.kind === "supplement") return amountFromDailyServings(item, ingredient);
  const directions = item.label?.[DIRECTIONS_SECTION] ?? [];
  const [paragraph] = directions;
  if (!paragraph) return { status: "not_parsed", reason: "the label has no directions text" };
  const parts = directions.length === 1 ? applicableDirections(paragraph, profile?.ageYears) : undefined;
  if (!parts) return { status: "not_parsed", reason: "the applicable directions could not be established" };
  const limits = parts.flatMap((part) => limitsIn(item, part));
  const [limit] = limits;
  if (!limit) {
    const maximum = parts.length === 1 && parts[0] ? maximumFromMassStatement(item, ingredient, parts[0]) : undefined;
    return maximum ?? { status: "not_parsed", reason: "no unambiguous daily maximum was found in the directions" };
  }
  if (!parts.every(understoodCapContext)) {
    return { status: "not_parsed", reason: "the context of the daily limit could not be fully read" };
  }
  if (limits.some((other) => other.value !== limit.value || singular(other.unit) !== singular(limit.unit))) {
    return { status: "not_parsed", reason: "the applicable directions contain conflicting limits" };
  }
  let doseSize: LabelAmount | undefined;
  if (singular(limit.unit) === DOSE_UNIT) {
    const row = parts.find((part) => part.isAgeRow) ?? parts[0];
    doseSize = row && doseIn(item, row);
    if (!doseSize) return { status: "not_parsed", reason: "the applicable directions do not give a clear dose size" };
  }
  const doseOrLimit = doseSize ?? limit;
  const amount = mgIn(doseOrLimit.value, doseOrLimit.unit, ingredient);
  if (!amount.ok) return { status: "not_parsed", reason: amount.reason };
  const mgPerDay = doseSize ? limit.value * amount.mg : amount.mg;
  if (!Number.isFinite(mgPerDay) || mgPerDay <= 0) return { status: "not_parsed", reason: "the quantity is invalid" };
  return { status: "parsed", mgPerDay, limit, limitsFound: limits.length, ...(doseSize ? { doseSize } : {}) };
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
  readonly basis: string | undefined;
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
  readonly commonBasis: string | undefined;
  readonly knownSubtotal: number | null;
  readonly ceiling: MemberCeiling | undefined;
  readonly isOverCeiling: boolean;
}

function lowestBy<T>(values: readonly T[], amountOf: (value: T) => number): T | undefined {
  return values.reduce<T | undefined>(
    (lowest, value) => (lowest === undefined || amountOf(value) < amountOf(lowest) ? value : lowest),
    undefined,
  );
}

function strengthBasisOf(item: CabinetItem, ingredient: Ingredient): string | undefined {
  const stated = ingredient.strengthBasis?.trim().toLowerCase();
  if (stated) return stated;
  const name = ingredient.name.trim().toLowerCase();
  const active = item.label?.active_ingredient ?? [];
  if (item.kind === "supplement") {
    return active.some((line) => line.trim().toLowerCase() === name) ? name : undefined;
  }
  return labelStrengthBasis(ingredient, item.label)?.toLowerCase();
}

function totalsFor(group: DuplicatedIngredient, profile?: AgeProfile): GroupTotals {
  const entries = group.members.map((member) => {
    const basis = strengthBasisOf(member.item, member.ingredient);
    const maximum = labelledMaximum(member.item, member.ingredient, profile);
    return { member, maximum, basis };
  });
  const parsed = entries.flatMap((entry) =>
    entry.maximum.status === "parsed" ? [{ ...entry, maximum: entry.maximum }] : [],
  );
  const commonBasis = parsed[0]?.basis;
  const comparable = commonBasis !== undefined && parsed.every((entry) => entry.basis === commonBasis);
  const combined = parsed.reduce((sum, entry) => sum + entry.maximum.mgPerDay, 0);
  const total = comparable && parsed.length === entries.length && Number.isFinite(combined) ? combined : null;
  const ceilings = group.members.flatMap((member) => {
    const ceiling = labelledCeiling(member.item, group.name);
    return ceiling === undefined ? [] : [{ member, ceiling }];
  });
  const ceiling = lowestBy(ceilings, (entry) => entry.ceiling.mgPerDay);
  const sameAsCeiling = parsed.filter((entry) => entry.basis === group.name);
  const subtotal = sameAsCeiling.reduce((sum, entry) => sum + entry.maximum.mgPerDay, 0);
  const knownSubtotal = sameAsCeiling.length > 0 && Number.isFinite(subtotal) ? subtotal : null;
  return {
    entries,
    parsed,
    commonBasis: comparable ? commonBasis : undefined,
    lowest: comparable ? lowestBy(parsed, (entry) => entry.maximum.mgPerDay) : undefined,
    total,
    ceiling,
    knownSubtotal,
    isOverCeiling: knownSubtotal !== null && ceiling !== undefined && knownSubtotal > ceiling.ceiling.mgPerDay,
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
    ...(totals.total === null && totals.knownSubtotal !== null ? { knownSubtotalMgPerDay: totals.knownSubtotal } : {}),
  };
}

function describeMember(entry: MemberMaximum): string {
  const name = entry.member.item.displayName;
  if (entry.maximum.status === "not_parsed") {
    return `${name}: no daily maximum could be read from the label, because ${entry.maximum.reason}.`;
  }
  const ingredientName = entry.basis ?? "the labelled ingredient";
  const { limit, doseSize, mgPerDay, servings } = entry.maximum;
  if (servings !== undefined) {
    return `${name}: the directions say "${limit.matchedText}" and the label record gives ${formatNumber(servings.unitsPerServing)} ${servings.unit} ${formatNumber(servings.servingsPerDay)} time(s) a day, which is ${formatNumber(mgPerDay)} mg of ${ingredientName} a day.`;
  }
  const dose = doseSize === undefined ? "" : ` with the dose size "${doseSize.matchedText}"`;
  return `${name}: the label says "${limit.matchedText}"${dose}, which is ${formatNumber(mgPerDay)} mg of ${ingredientName} in 24 hours.`;
}

function detailFor(totals: GroupTotals): string {
  const lowestLine =
    totals.lowest === undefined
      ? []
      : [`The lowest labelled maximum is ${formatNumber(totals.lowest.maximum.mgPerDay)} mg.`];
  const totalLine =
    totals.total === null
      ? "A combined total cannot be worked out because one or more amounts or strength bases could not be verified. Nothing was guessed."
      : `If each product were taken at its own labelled maximum, the total would be ${formatNumber(totals.total)} mg of ${totals.commonBasis} in 24 hours.`;
  const over = totals.isOverCeiling && totals.knownSubtotal !== null
    ? ` The readable maxima alone total ${formatNumber(totals.knownSubtotal)} mg, above that amount.`
    : "";
  const ceilingLine =
    totals.ceiling === undefined
      ? []
      : [`The ${totals.ceiling.member.item.displayName} label warns about "${totals.ceiling.ceiling.matchedText}".${over}`];
  return [
    ...totals.entries.map(describeMember),
    ...lowestLine,
    totalLine,
    ...ceilingLine,
    "Ask a pharmacist or doctor before taking these on the same day.",
  ].join(" ");
}

function explainFor(totals: GroupTotals, ingredientName: string): string {
  if (totals.total === null) {
    if (totals.isOverCeiling && totals.knownSubtotal !== null && totals.ceiling) {
      return `The readable maxima alone total ${formatNumber(totals.knownSubtotal)} mg of ${ingredientName} a day, above the label warning of ${formatNumber(totals.ceiling.ceiling.mgPerDay)} mg, and the full total is unknown.`;
    }
    return `These products share ${ingredientName}, but the labels do not give enough to add up a daily amount.`;
  }
  const sum = `Taken at the most each label allows, these products add up to ${formatNumber(totals.total)} mg of ${totals.commonBasis} a day`;
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

function toFlag(group: DuplicatedIngredient, profile?: AgeProfile): Flag {
  const totals = totalsFor(group, profile);
  const supportingQuotes = quotesFor(totals);
  return {
    type: "daily_total",
    severity: severityFor(totals),
    itemIds: group.members.map((member) => member.item.id),
    title: `${group.name} daily total across ${group.members.length} products`,
    detail: detailFor(totals),
    explain: explainFor(totals, group.name),
    numbers: numbersFor(totals),
    ...(totals.lowest === undefined ? {} : { quote: totals.lowest.maximum.limit.quote }),
    ...(supportingQuotes.length === 0 ? {} : { supportingQuotes }),
  };
}

export function dailyTotalFlags(items: readonly CabinetItem[], profile?: AgeProfile): readonly Flag[] {
  return findDuplicatedIngredients(items).map((group) => toFlag(group, profile));
}
