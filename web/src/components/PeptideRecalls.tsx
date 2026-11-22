"use client";

import { useEffect, useState } from "react";
import { DEFINED_RECALL_CLASSES, RECALL_CLASS_DEFINITIONS } from "@engine/recallClasses.ts";
import { NAME_MATCH_NOTICE, type RecallClassification, type RecallStatus } from "@engine/recalls.ts";

export interface PeptideRecallItem {
  readonly recallNumber: string;
  readonly classification: RecallClassification;
  readonly status: RecallStatus;
  readonly reason: string;
  readonly productDescription: string;
  readonly recallingFirm: string;
  readonly initiationDate: string;
}

export interface PeptideRecallsResponse {
  readonly peptide: string;
  readonly total: number;
  readonly shown: readonly PeptideRecallItem[];
  readonly notice: string;
  readonly file: { readonly url: string; readonly lastUpdated: string; readonly records: number };
}

type Outcome = { status: "done"; result: PeptideRecallsResponse } | { status: "failed"; message: string };

const LOAD_FAILED = "The recall list could not load. Try again in a moment.";

async function fetchPeptideRecalls(peptideId: string): Promise<PeptideRecallsResponse> {
  const response = await fetch(`/api/peptide-recalls?id=${encodeURIComponent(peptideId)}`);
  const body = (await response.json().catch(() => null)) as (Partial<PeptideRecallsResponse> & { error?: string }) | null;
  if (!response.ok || body === null || !Array.isArray(body.shown)) throw new Error(body?.error ?? LOAD_FAILED);
  return body as PeptideRecallsResponse;
}

function countLine(result: PeptideRecallsResponse): string {
  if (result.total > result.shown.length) {
    return `Showing the ${result.shown.length} newest of ${result.total} recalls that name this ingredient.`;
  }
  return `${result.total} ${result.total === 1 ? "recall names" : "recalls name"} this ingredient.`;
}

function RecallList({ result }: { result: PeptideRecallsResponse }) {
  const classesShown = DEFINED_RECALL_CLASSES.filter((recallClass) =>
    result.shown.some((recall) => recall.classification === recallClass),
  );

  if (result.total === 0) {
    return <p className="mt-2 font-bold">No recall in the FDA file names this ingredient. That does not mean a vial is safe.</p>;
  }
  return (
    <>
      <p className="mt-2 font-bold">{countLine(result)}</p>
      <ul>
        {result.shown.map((recall) => (
          <li key={recall.recallNumber} className="mt-3">
            <div className="facts-row">
              <span>
                {recall.initiationDate}, {recall.recallingFirm}
              </span>
              <span className="font-bold text-right">
                {recall.classification}, {recall.status}
              </span>
            </div>
            <blockquote className="quote mt-1">{recall.reason}</blockquote>
            <p className="mt-1 text-sm text-ink-soft">{recall.productDescription}</p>
          </li>
        ))}
      </ul>
      {classesShown.length > 0 && (
        <>
          <h3 className="facts-head mt-4">What the FDA says each class means</h3>
          {classesShown.map((recallClass) => {
            const definition = RECALL_CLASS_DEFINITIONS[recallClass];
            return (
              <figure key={recallClass} className="mt-2">
                <blockquote className="quote">
                  {recallClass} recall: {definition.text}
                </blockquote>
                <figcaption className="mt-1 text-sm text-ink-soft">
                  <a className="underline" href={definition.sourceUrl} target="_blank" rel="noreferrer">
                    FDA page
                  </a>
                  , dated {definition.pageDate}.
                </figcaption>
              </figure>
            );
          })}
        </>
      )}
      <p className="mt-3 text-sm text-ink-soft">
        Searched the FDA drug recall file dated {result.file.lastUpdated}, {result.file.records.toLocaleString("en-US")} records.
      </p>
    </>
  );
}

export function PeptideRecalls({ peptideId }: { peptideId: string }) {
  const [settled, setSettled] = useState<{ id: string; outcome: Outcome } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchPeptideRecalls(peptideId)
      .then((result) => !cancelled && setSettled({ id: peptideId, outcome: { status: "done", result } }))
      .catch((error: unknown) => {
        if (cancelled) return;
        setSettled({ id: peptideId, outcome: { status: "failed", message: error instanceof Error ? error.message : LOAD_FAILED } });
      });
    return () => {
      cancelled = true;
    };
  }, [peptideId]);

  const outcome = settled?.id === peptideId ? settled.outcome : null;

  return (
    <div className="facts" aria-busy={outcome === null}>
      <h2 className="facts-head">FDA recalls that name this ingredient</h2>
      <p className="mt-2 text-sm">{NAME_MATCH_NOTICE}</p>
      {outcome === null && <p className="mt-2 text-ink-soft">Looking through the FDA recall file.</p>}
      {outcome?.status === "failed" && (
        <p className="mt-2" role="alert">
          {outcome.message}
        </p>
      )}
      {outcome?.status === "done" && <RecallList result={outcome.result} />}
    </div>
  );
}
