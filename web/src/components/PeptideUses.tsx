"use client";

import { PEPTIDE_LABELS, PRESCRIBER_NOTICE, type ProductLabel } from "@engine/peptideLabels.ts";
import type { PeptideId } from "@engine/peptides.ts";

function Quote({ lines }: { lines: readonly string[] }) {
  return (
    <blockquote className="quote">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
    </blockquote>
  );
}

function LabelSection({ title, lines }: { title: string; lines: readonly string[] | undefined }) {
  if (lines === undefined || lines.length === 0) return null;
  return (
    <figure className="mt-3">
      <h4 className="facts-head">{title}</h4>
      <div className="mt-2">
        <Quote lines={lines} />
      </div>
    </figure>
  );
}

function ProductPanel({ product }: { product: ProductLabel }) {
  return (
    <section className="mt-4">
      <div className="facts-row">
        <span className="font-bold">{product.presentation}</span>
        <span className="text-right">FDA-approved label</span>
      </div>
      <LabelSection title="What the label says it is for" lines={product.indications} />
      <LabelSection title="How the label says to start" lines={product.dosing} />
      <LabelSection title="Boxed warning" lines={product.boxedWarning} />
      <LabelSection title="Who should not use it" lines={product.contraindications} />
      <p className="mt-2 text-sm text-ink-soft">
        Source:{" "}
        <a className="underline" href={product.url} target="_blank" rel="noreferrer">
          {product.title}
        </a>
        , DailyMed label version {product.version}, dated {product.labelDate}.
      </p>
    </section>
  );
}

export function PeptideUses({ peptideId }: { peptideId: PeptideId }) {
  const entry = PEPTIDE_LABELS[peptideId];

  return (
    <div className="facts">
      <h2 className="facts-title">What it is approved for</h2>
      {entry.notice && <p className="mt-3">{entry.notice}</p>}
      {entry.approved && entry.products.map((product) => <ProductPanel key={product.presentation} product={product} />)}
      {!entry.approved && entry.proposedUse && (
        <figure className="mt-3">
          <h4 className="facts-head">Proposed in a nomination to the FDA</h4>
          <div className="mt-2">
            <Quote lines={[entry.proposedUse.text]} />
          </div>
          <figcaption className="mt-1 text-sm text-ink-soft">
            <a className="underline" href={entry.proposedUse.sourceUrl} target="_blank" rel="noreferrer">
              FDA page
            </a>
            , dated {entry.proposedUse.pageDate}.
          </figcaption>
        </figure>
      )}
      <p className="mt-4 font-bold">{PRESCRIBER_NOTICE}</p>
    </div>
  );
}
