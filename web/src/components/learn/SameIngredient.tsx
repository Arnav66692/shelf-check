"use client";

import Link from "next/link";
import type { Product } from "@/lib/model";
import { learnHref } from "./copy";
import { SectionHeading } from "./LessonSectionPanel";

const SALT_WORDS =
  /\b(?:hydrobromide|hbr|hydrochloride|hcl|sodium|potassium|calcium|magnesium|succinate|maleate|citrate|sulfate|tartrate|bitartrate|besylate|mesylate|fumarate|phosphate|acetate|monohydrate|dihydrate|anhydrous)\b/g;

function ingredientKey(name: string): string {
  const base = name.toLowerCase().replace(SALT_WORDS, " ").replace(/\s+/g, " ").trim();
  return base === "" ? name.toLowerCase().trim() : base;
}

type Group = { readonly name: string; readonly matches: readonly Product[] };

function sameIngredientGroups(names: readonly string[], others: readonly Product[]): readonly Group[] {
  const seen = new Set<string>();
  return names.flatMap((name) => {
    const key = ingredientKey(name);
    if (seen.has(key)) return [];
    seen.add(key);
    const matches = others.filter((product) => product.ingredients.some((ingredient) => ingredientKey(ingredient.name) === key));
    return matches.length > 0 ? [{ name, matches }] : [];
  });
}

function countLine(group: Group, owned: boolean): string {
  const name = group.name.toUpperCase();
  if (owned) return `You have ${group.matches.length + 1} products with ${name}.`;
  const count = group.matches.length;
  return `${count} ${count === 1 ? "product" : "products"} in your cabinet ${count === 1 ? "has" : "have"} ${name}.`;
}

export function SameIngredient({
  setId,
  substances,
  items,
  position,
}: {
  setId: string;
  substances: readonly string[];
  items: readonly Product[];
  position: number;
}) {
  const isThis = (product: Product) => product.record?.splSetId?.toLowerCase() === setId;
  const owned = items.find(isThis);
  const names = owned && owned.ingredients.length > 0 ? owned.ingredients.map((ingredient) => ingredient.name) : substances;
  const groups = sameIngredientGroups(names, items.filter((product) => !isThis(product)));
  const headingId = "learn-compare-title";

  return (
    <section id="learn-compare" aria-labelledby={headingId} className="facts">
      <SectionHeading id={headingId} position={position} title="Same ingredient in your cabinet" />
      {items.length === 0 && <p className="mt-4 text-ink-soft">Your cabinet is empty, so there is nothing to compare.</p>}
      {items.length > 0 && groups.length === 0 && (
        <p className="mt-4 text-ink-soft">No other product in your cabinet has the same active ingredient.</p>
      )}
      {groups.map((group) => (
        <div key={group.name} className="mt-4">
          <p className="font-semibold">{countLine(group, owned !== undefined)}</p>
          <ul className="mt-2">
            {group.matches.map((product) => {
              const otherSetId = product.record?.splSetId;
              return (
                <li key={product.id} className="facts-row">
                  {otherSetId ? (
                    <Link className="underline font-bold" href={learnHref(otherSetId)}>
                      {product.displayName}
                    </Link>
                  ) : (
                    <span className="font-bold">{product.displayName}</span>
                  )}
                  <span className="text-sm text-ink-soft text-right">{product.maker}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {groups.length > 0 && (
        <p className="mt-4 thick pt-3">
          The labels do not rank one product over another. Ask your pharmacist which one fits you.
        </p>
      )}
    </section>
  );
}
