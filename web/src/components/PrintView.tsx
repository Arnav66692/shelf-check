"use client";

import { useEffect, useState } from "react";
import { ApiError, checkCabinet, type CheckResult } from "@/lib/api";
import { CONDITION_LABELS, formatStrength } from "@/lib/model";
import { useCabinet, useProfile } from "@/lib/store";

const KIND_NAME = { otc: "Over the counter", rx: "Prescription", supplement: "Supplement", vial: "Injectable" } as const;

export function PrintView() {
  const { items } = useCabinet();
  const { profile } = useProfile();
  const requestKey = JSON.stringify([items.map((item) => item.id), profile]);
  const [settled, setSettled] = useState<{ key: string; result?: CheckResult; error?: string } | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    checkCabinet(items, profile)
      .then((result) => !cancelled && setSettled({ key: requestKey, result }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setSettled({ key: requestKey, error: error instanceof ApiError ? error.message : "The check could not run." });
      });
    return () => {
      cancelled = true;
    };
  }, [items, profile, requestKey]);

  const current = settled?.key === requestKey ? settled : null;
  const warnings = (current?.result?.flags ?? []).filter((flag) => flag.severity !== "info");
  const about = [
    profile.ageYears !== undefined ? `Age ${profile.ageYears}` : null,
    ...profile.conditions.map((id) => CONDITION_LABELS[id]),
    profile.pregnant ? "Pregnant" : null,
    profile.breastfeeding ? "Breastfeeding" : null,
    profile.drinksThreeOrMoreDaily ? "Three or more alcoholic drinks most days" : null,
    profile.allergies.length > 0 ? `Allergies: ${profile.allergies.join(", ")}` : null,
  ].filter((line): line is string => line !== null);

  return (
    <div className="pt-6 max-w-[820px]">
      <div className="flex flex-wrap items-baseline justify-between gap-4 print:hidden">
        <h1 className="text-3xl font-medium narrow">List for your pharmacist or doctor</h1>
        <button type="button" className="btn" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <section className="facts mt-5">
        <h2 className="facts-title">What I take</h2>
        {items.length === 0 && <p className="mt-2">Nothing in the cabinet yet.</p>}
        {items.map((item) => (
          <div key={item.id} className="py-2 border-b border-hair last:border-b-0">
            <div className="font-semibold">{item.displayName}</div>
            <div className="text-sm">
              {item.ingredients.map((ingredient) => `${ingredient.name} ${formatStrength(ingredient)}`).join(", ") ||
                "No structured ingredients on record"}
            </div>
            <div className="text-sm text-ink-soft">
              {KIND_NAME[item.kind]}. {item.maker}
              {item.productNdc ? `, NDC ${item.productNdc}` : ""}
            </div>
          </div>
        ))}
      </section>

      {about.length > 0 && (
        <section className="facts mt-5">
          <h2 className="facts-title">About me</h2>
          <p className="mt-2">{about.join(". ")}.</p>
        </section>
      )}

      <section className="facts mt-5">
        <h2 className="facts-title">Questions from the labels</h2>
        {!current && items.length > 0 && <p className="mt-2">Reading the labels together.</p>}
        {current?.error && <p className="mt-2">{current.error}</p>}
        {current?.result && warnings.length === 0 && <p className="mt-2">No label warnings found between these.</p>}
        {warnings.map((flag) => (
          <div key={flag.id} className="py-2 border-b border-hair last:border-b-0">
            <div className="font-semibold">{flag.title}</div>
            <div className="text-sm">{flag.explain}</div>
            {flag.quotes[0] && <div className="quote mt-1 text-sm">{flag.quotes[0].excerpt}</div>}
          </div>
        ))}
      </section>
      <p className="mt-4 text-sm text-ink-soft">
        Made with Shelf Check from official FDA and NIH label records. A safety check, not medical advice.
      </p>
    </div>
  );
}
