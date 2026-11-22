import { sentencesIn, toQuote } from "../labelText.ts";
import type { LabelSentence } from "../labelText.ts";
import { joinNames, spanOf, termRegExp } from "../text.ts";
import type { CabinetItem, Flag, Ingredient, LabelSectionName, Quote } from "../types.ts";
import { severityForSection } from "./severity.ts";

const COMBINATION_WARNING = /\bother\s+(?:drug|product|medicine|medication)s?\s+(?:that\s+)?contain(?:ing|s)?\b/i;
const COMBINATION_WARNING_SECTIONS: readonly LabelSectionName[] = [
  "do_not_use",
  "boxed_warning",
  "contraindications",
  "warnings",
  "ask_doctor_or_pharmacist",
  "when_using",
];
const INGREDIENT_LIST_SECTIONS: readonly LabelSectionName[] = ["active_ingredient"];

export interface IngredientMember {
  readonly item: CabinetItem;
  readonly ingredient: Ingredient;
}

export interface DuplicatedIngredient {
  readonly name: string;
  readonly members: readonly IngredientMember[];
}

function firstMemberPerItem(members: readonly IngredientMember[]): readonly IngredientMember[] {
  return members.filter((member, index) => members.findIndex((other) => other.item.id === member.item.id) === index);
}

export function findDuplicatedIngredients(items: readonly CabinetItem[]): readonly DuplicatedIngredient[] {
  const members = items.flatMap((item) => item.ingredients.map((ingredient) => ({ item, ingredient })));
  const names = [...new Set(members.map((member) => member.ingredient.name.toLowerCase()))];
  return names
    .map((name) => ({
      name,
      members: firstMemberPerItem(members.filter((member) => member.ingredient.name.toLowerCase() === name)),
    }))
    .filter((group) => group.members.length >= 2);
}

function findQuote(
  item: CabinetItem,
  sections: readonly LabelSectionName[],
  namesIngredient: RegExp,
  accepts: (sentence: LabelSentence) => boolean,
): Quote | undefined {
  const sentence = sentencesIn(item.label, sections).find(accepts);
  return sentence === undefined ? undefined : toQuote(item.id, sentence, spanOf(namesIngredient, sentence.text));
}

function isPresent<T>(value: T | undefined): value is T {
  return value !== undefined;
}

function combinationWarnings(group: DuplicatedIngredient): readonly Quote[] {
  const namesIngredient = termRegExp(group.name);
  const accepts = (sentence: LabelSentence): boolean =>
    COMBINATION_WARNING.test(sentence.text) && namesIngredient.test(sentence.text);
  return COMBINATION_WARNING_SECTIONS.flatMap((section) =>
    group.members.map((member) => findQuote(member.item, [section], namesIngredient, accepts)).filter(isPresent),
  );
}

function ingredientListings(group: DuplicatedIngredient): readonly Quote[] {
  const namesIngredient = termRegExp(group.name);
  return group.members
    .map((member) =>
      findQuote(member.item, INGREDIENT_LIST_SECTIONS, namesIngredient, (sentence) => namesIngredient.test(sentence.text)),
    )
    .filter(isPresent);
}

function toFlag(group: DuplicatedIngredient): Flag {
  const warnings = combinationWarnings(group);
  const quotes = warnings.length > 0 ? warnings : ingredientListings(group);
  const [quote] = quotes;
  const [firstWarning] = warnings;
  const productNames = group.members.map((member) => member.item.displayName);
  return {
    type: "duplicate_ingredient",
    severity: firstWarning === undefined ? "ask" : severityForSection(firstWarning.section),
    itemIds: group.members.map((member) => member.item.id),
    title: `${group.name} is in ${group.members.length} of your products`,
    detail: `${joinNames(productNames)} each contain ${group.name}. Taking more than one of them means taking ${group.name} more than once. Ask a pharmacist or doctor before using them together.`,
    explain: `${joinNames(productNames)} ${productNames.length === 2 ? "both" : "all"} contain ${group.name}, so taking them together means taking it more than once.`,
    numbers: { productCount: group.members.length },
    ...(quote === undefined ? {} : { quote, supportingQuotes: quotes }),
  };
}

export function duplicateFlags(items: readonly CabinetItem[]): readonly Flag[] {
  return findDuplicatedIngredients(items).map(toFlag);
}
