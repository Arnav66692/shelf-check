import { screenEmergency, matchSymptoms, type CabinetItem, type SymptomMatch } from "@engine/index.ts";
import { buildCabinet, flagsFor } from "@/server/cabinet";
import { MAX_SYMPTOM_TEXT_LENGTH, TEXT_TOO_LONG } from "@/server/causes";
import { recallFlags, tagFlags } from "@/server/extras";
import { failure } from "@/server/respond";
import { readItems, readProfile } from "@/server/validate";
import type { Flag, Profile } from "@/lib/model";

const CHILD_AGE_YEARS = 12;
const WEEKS_IN_THREE_MONTHS = 13;
const DAYS_IN_THREE_MONTHS = 91;
const YOUNG_INFANT_MONTHS = 3;
const FEVER = /\b(fever|feverish|temperature|hot to the touch)\b/i;
const BABY = /\b(baby|babies|newborn|infant)\b/i;
const CHILD = /\b(baby|babies|newborn|infant|toddler|child|children|kid|kids|son|daughter)\b/i;
const AGE_IN_YEARS = /\b(\d{1,2})\s*(?:-\s*)?(?:years?|yrs?|y\/?o)\b(?:\s*-?\s*old)?/i;
const AGE_IN_DAYS = /\b(\d+)\s*(?:-\s*)?(?:days?)\s*old\b/i;
const AGE_IN_WEEKS = /\b(\d+)\s*(?:-\s*)?(?:weeks?|wks?)\s*old\b/i;
const AGE_IN_MONTHS = /\b(\d+)\s*(?:-\s*)?(?:months?|mos?)\s*old\b/i;
const UNDER_AGE_RULE =
  /\b(?:under|younger than|less than|below)\s+(\d+)\s*(?:years?|yrs?)?(?:\s+of\s+age)?(?:\s+old)?\s*[:,.-]?\s*(?:do not (?:use|give|take)|ask a doctor|consult a doctor|not recommended)/g;
const ADULT_ROW = /\b(?:adults (?:and|&) children|children)\s+(\d+)\s*(?:years?|yrs?)?(?:\s+of\s+age)?\s+(?:and|or|&)\s+(?:over|older)/g;
// A younger row only counts as a dose when it gives one, not when it says to ask a doctor or not to use.
const YOUNGER_ROW = /\bchildren\s+(\d+)\s*(?:years?|yrs?)?\s*(?:to|-)\s*(?:under\s+)?(\d+)(?!\s*(?:years?|yrs?)?(?:\s+of\s+age)?\s*[:,-]?\s*(?:ask a doctor|do not use|consult a doctor))/g;

type Hidden = { readonly itemId: string; readonly reason: string };

function underThreeMonthsInText(text: string): boolean {
  const days = AGE_IN_DAYS.exec(text);
  if (days && Number(days[1]) < DAYS_IN_THREE_MONTHS) return true;
  const weeks = AGE_IN_WEEKS.exec(text);
  if (weeks && Number(weeks[1]) < WEEKS_IN_THREE_MONTHS) return true;
  const months = AGE_IN_MONTHS.exec(text);
  return months !== null && Number(months[1]) < YOUNG_INFANT_MONTHS;
}

// "my 3 year old has a fever" says the age even when the profile does not.
const WORD_AGES: Readonly<Record<string, number>> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const AGE_IN_WORDS = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)[- ](?:years?|yrs?)[- ]old\b/i;
const AGE_IN_MONTHS_ANY = /\b(\d{1,2})\s*(?:-\s*)?(?:months?|mos?|mo)\b(?:\s*-?\s*old)?/i;

function childAgeInText(text: string): number | undefined {
  const years = AGE_IN_YEARS.exec(text);
  if (years && (CHILD.test(text) || /\b(?:years?|yrs?)[- ]old\b|\dy\/?o\b|\by\/?o\b/i.test(text))) {
    const age = Number(years[1]);
    return age < REYE_MAX_AGE ? age : undefined;
  }
  const words = AGE_IN_WORDS.exec(text);
  if (words?.[1]) return WORD_AGES[words[1].toLowerCase()];
  const months = AGE_IN_MONTHS_ANY.exec(text);
  if (months) return Math.floor(Number(months[1]) / 12);
  return /\btoddler\b/i.test(text) ? 1 : undefined;
}

function needsChildDoctor(text: string, profile: Profile): boolean {
  if (underThreeMonthsInText(text)) return true;
  if (!FEVER.test(text)) return false;
  return BABY.test(text) || profile.ageYears === 0;
}

function directionsText(item: CabinetItem): string {
  return (item.label?.dosage_and_administration ?? []).join(" ").toLowerCase();
}

function minimumAge(item: CabinetItem): number {
  if (item.kind === "rx" || item.kind === "vial") return 0;
  const text = directionsText(item);
  const ruled = [...text.matchAll(UNDER_AGE_RULE)].map((match) => Number(match[1]));
  const adultRows = [...text.matchAll(ADULT_ROW)].map((match) => Number(match[1]));
  const youngerRows = [...text.matchAll(YOUNGER_ROW)].map((match) => Number(match[1]));
  const lowestAdultRow = adultRows.length > 0 ? Math.min(...adultRows) : 0;
  const hasYoungerRow = youngerRows.some((age) => age < lowestAdultRow);
  return Math.max(0, ...ruled, hasYoungerRow ? 0 : lowestAdultRow);
}

const REYE_MAX_AGE = 19;

function warnsAboutReye(item: CabinetItem): boolean {
  const label = item.label ?? {};
  return [label.warnings, label.do_not_use, label.ask_doctor].some((texts) => (texts ?? []).some((text) => /\breye['’]?s syndrome\b/i.test(text)));
}

// A Check now pair, allergy or health card about this product means it is not suggested.
function hasStop(flags: readonly Flag[], itemId: string): boolean {
  return flags.some((flag) => flag.severity === "stop" && (flag.type === "interaction" || flag.type === "profile") && flag.itemIds.includes(itemId));
}

function splitByAge(matches: readonly SymptomMatch[], profile: Profile, aboutChild = false): { shown: SymptomMatch[]; hidden: Hidden[] } {
  const age = profile.ageYears;
  const shown: SymptomMatch[] = [];
  const hidden: Hidden[] = [];
  for (const match of matches) {
    if (((age !== undefined && age < REYE_MAX_AGE) || (age === undefined && aboutChild)) && warnsAboutReye(match.item)) {
      hidden.push({
        itemId: match.item.id,
        reason: "Its label warns children and teenagers about Reye's syndrome, especially with the flu or chickenpox. Ask a pharmacist for something else.",
      });
      continue;
    }
    const minimum = minimumAge(match.item);
    // A message about a child with no age set: leave out products whose directions start at 12 or older.
    if (age === undefined && aboutChild && minimum >= CHILD_AGE_YEARS) {
      hidden.push({
        itemId: match.item.id,
        reason: `Its directions are for people ${minimum} years and older. Set the child's age in About you to see what fits them.`,
      });
      continue;
    }
    if (age !== undefined && age < CHILD_AGE_YEARS && age < minimum) {
      hidden.push({
        itemId: match.item.id,
        reason: `Not listed for age ${age}. Its directions are for people ${minimum} years and older, or say a younger child should not use it or should see a doctor first.`,
      });
    } else {
      shown.push(match);
    }
  }
  return { shown, hidden };
}

function onlyFor(flags: readonly Flag[], ids: ReadonlySet<string>): readonly Flag[] {
  return flags.filter((flag) => flag.itemIds.some((id) => ids.has(id)));
}

export async function POST(request: Request): Promise<Response> {
  const body = (await request.json().catch(() => null)) as { text?: unknown; items?: unknown; profile?: unknown } | null;
  const text = typeof body?.text === "string" ? body.text.trim() : "";
  if (text.length > MAX_SYMPTOM_TEXT_LENGTH) return Response.json({ error: TEXT_TOO_LONG }, { status: 400 });
  const products = readItems(body?.items);
  if (text.length < 3) return Response.json({ error: "Say how you feel in a few words." }, { status: 400 });
  if (products === null) {
    return Response.json({ error: "Your cabinet could not be read. Try removing the last product you added." }, { status: 400 });
  }
  const saved = readProfile(body?.profile);
  const typedAge = childAgeInText(text);
  // "toddler" is a guess. A real age in the profile wins over it.
  const statedAge = typedAge !== undefined && /\btoddler\b/i.test(text) && !/\d/.test(text) && saved.ageYears !== undefined ? undefined : typedAge;
  const profile = statedAge === undefined ? saved : { ...saved, ageYears: statedAge };
  const screen = screenEmergency(text, profile.ageYears !== undefined ? { ageMonths: profile.ageYears * 12 } : undefined);
  if (screen.emergency) {
    return Response.json({
      emergency: true,
      poison: screen.poison,
      selfHarm: screen.selfHarm,
      matches: [],
      flags: [],
      hidden: [],
      unchecked: [],
    });
  }
  const childDoctor = needsChildDoctor(text, profile);
  const forChild = statedAge === undefined && CHILD.test(text) && (profile.ageYears === undefined || profile.ageYears >= CHILD_AGE_YEARS);
  if (childDoctor) {
    return Response.json({ emergency: false, childDoctor, forChild, matches: [], flags: [], hidden: [], unchecked: [] });
  }
  try {
    const cabinet = await buildCabinet(products);
    const byAge = splitByAge(matchSymptoms(text, cabinet.items), profile, CHILD.test(text));
    const ageHiddenIds = new Set(byAge.hidden.map((entry) => entry.itemId));
    const recalls = await recallFlags(cabinet.recallSubjects);
    const flags = [
      ...recalls.filter((flag) => flag.severity === "stop"),
      ...flagsFor(cabinet.items, profile),
      ...tagFlags(cabinet.items),
      ...recalls.filter((flag) => flag.severity !== "stop"),
    ];
    // A product that a Check now warning in this cabinet is about is not suggested. Its warning stays on screen.
    const blocked = byAge.shown.filter((match) => hasStop(flags, match.item.id));
    const shown = byAge.shown.filter((match) => !hasStop(flags, match.item.id));
    const hidden = [
      ...byAge.hidden,
      ...blocked.map((match) => ({
        itemId: match.item.id,
        reason: "A Check now warning in your cabinet is about this product. Read it below and ask a pharmacist what to use instead.",
      })),
    ];
    const relevantIds = new Set([...shown, ...blocked].map((match) => match.item.id));
    return Response.json({
      emergency: false,
      childDoctor,
      forChild,
      matches: shown.map((match) => ({ itemId: match.item.id, uses: match.quote.excerpt })),
      hidden,
      // A warning that needs a product already left out for this age does not apply.
      flags: onlyFor(flags, relevantIds).filter((flag) => !flag.itemIds.some((id) => ageHiddenIds.has(id))),
      unchecked: cabinet.unchecked,
    });
  } catch (error) {
    return failure(error);
  }
}
