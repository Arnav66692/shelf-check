"use client";

import Link from "next/link";
import { useCabinet } from "@/lib/store";
import { formatStrength } from "@/lib/model";
import type { Lesson, LessonModel } from "@/server/learn/types";
import { ModelPanel } from "../ModelPanel";
import { LABEL_ONLY_NOTE, twoDigits } from "./copy";
import { LessonSectionPanel } from "./LessonSectionPanel";
import { SameIngredient } from "./SameIngredient";

const MODEL_CAPTION: Record<LessonModel, string> = {
  capsule: "Tablet or capsule",
  syringe: "Injection",
  bottle: "Bottle",
};

const KIND_LINE: Record<Lesson["kind"], string> = {
  otc: "Over the counter",
  rx: "Prescription",
};

function JumpList({ entries }: { entries: readonly { id: string; title: string }[] }) {
  return (
    <nav aria-label="Sections on this page" className="min-w-0 lg:sticky lg:top-[120px] lg:self-start">
      <p className="label hud-bar">On this page</p>
      <ol className="mt-3 grid grid-cols-1 gap-x-6 sm:grid-cols-2 lg:grid-cols-1">
        {entries.map((entry, index) => (
          <li key={entry.id}>
            <a
              href={`#learn-${entry.id}`}
              className="flex min-h-[44px] items-baseline gap-3 border-b border-[var(--hair)] py-2 transition-colors hover:text-[var(--accent)]"
            >
              <span className="mono text-[var(--accent)]">{twoDigits(index + 1)}</span>
              <span className="mono text-ink">{entry.title}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function LessonView({ lesson }: { lesson: Lesson }) {
  const { items } = useCabinet();
  const owned = items.find((product) => product.record?.splSetId?.toLowerCase() === lesson.setId);
  const recordUrl = owned?.recordUrl || lesson.recordUrl;
  const model: LessonModel = owned?.kind === "vial" ? "syringe" : lesson.model;
  const entries = [
    ...lesson.sections.map((section) => ({ id: section.id, title: section.title })),
    { id: "compare", title: "Same ingredient in your cabinet" },
  ];

  return (
    <div className="pt-6">
      <header className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="label">
            <Link href="/learn" className="underline">
              Learning center
            </Link>
            <span aria-hidden="true"> / </span>
            {KIND_LINE[lesson.kind]}
          </p>
          <h1 className="mt-4 text-3xl font-medium narrow">{lesson.name}</h1>
          {lesson.genericName && <p className="mt-3 label">{lesson.genericName}</p>}
          <p className="mt-4 facts">{LABEL_ONLY_NOTE}</p>
          <div className="mt-4 facts">
            <div className="facts-head">
              Active ingredients{owned?.form ? ` (${owned.form.toLowerCase()})` : ""}
            </div>
            {owned && owned.ingredients.length > 0 ? (
              owned.ingredients.map((ingredient) => (
                <div className="facts-row" key={`${ingredient.name}-${ingredient.value}`}>
                  <span className="capitalize">{ingredient.name}</span>
                  <span className="font-bold whitespace-nowrap">{formatStrength(ingredient)}</span>
                </div>
              ))
            ) : lesson.activeIngredient ? (
              <figure className="mt-3">
                <blockquote className="quote">{lesson.activeIngredient.text}</blockquote>
                <figcaption className="mt-1 text-sm text-ink-soft">From the label, section Active ingredient.</figcaption>
              </figure>
            ) : (
              lesson.substances.map((substance) => (
                <div className="facts-row" key={substance}>
                  <span className="capitalize">{substance.toLowerCase()}</span>
                </div>
              ))
            )}
            {lesson.substances.length === 0 && !lesson.activeIngredient && !owned && (
              <div className="facts-row">The label lists no active ingredients.</div>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              <a className="btn btn-quiet" href={recordUrl} target="_blank" rel="noopener noreferrer">
                Read the full label
                <span className="sr-only">, opens DailyMed in a new tab</span>
              </a>
            </div>
          </div>
        </div>
        <ModelPanel name={model} caption={MODEL_CAPTION[model]} />
      </header>

      <div className="mt-10 grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,16rem)_minmax(0,1fr)]">
        <JumpList entries={entries} />
        <div className="grid min-w-0 gap-6">
          {lesson.sections.map((section, index) => (
            <LessonSectionPanel key={section.id} section={section} position={index + 1} recordUrl={recordUrl} />
          ))}
          <SameIngredient setId={lesson.setId} substances={lesson.substances} items={items} position={entries.length} />
        </div>
      </div>
    </div>
  );
}
