"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, checkCabinet, type CheckResult } from "@/lib/api";
import { useCabinet, useProfile, useSupply } from "@/lib/store";
import { supplyFlags } from "@/lib/supply";
import { useToday } from "@/lib/today";
import { FlagRow } from "./FlagRow";
import { ProductPanel } from "./ProductPanel";
import { ReadAloud } from "./ReadAloud";
import { SupplyFields } from "./SupplyFields";

const SEVERITY_ORDER = ["stop", "ask", "info"];

type Outcome = { status: "done"; result: CheckResult } | { status: "failed"; message: string };
type CheckState = { status: "checking" } | Outcome;

export function CabinetView() {
  const { items, remove } = useCabinet();
  const { profile } = useProfile();
  const { supply } = useSupply();
  const today = useToday();
  const requestKey = JSON.stringify([items.map((item) => item.id), profile]);
  const [settled, setSettled] = useState<{ key: string; outcome: Outcome } | null>(null);

  useEffect(() => {
    if (items.length === 0) return;
    let cancelled = false;
    checkCabinet(items, profile)
      .then((result) => !cancelled && setSettled({ key: requestKey, outcome: { status: "done", result } }))
      .catch((error: unknown) => {
        if (cancelled) return;
        const message = error instanceof ApiError ? error.message : "The check could not run.";
        setSettled({ key: requestKey, outcome: { status: "failed", message } });
      });
    return () => {
      cancelled = true;
    };
  }, [items, profile, requestKey]);

  const state: CheckState = settled?.key === requestKey ? settled.outcome : { status: "checking" };

  if (items.length === 0) {
    return (
      <section className="pt-10 max-w-[720px]">
        <h1 className="text-[clamp(2.2rem,6vw,3.6rem)] font-extrabold leading-[1.02] tracking-tight narrow">
          Two bottles can hide the same drug.
        </h1>
        <p className="mt-5 text-lg">
          Tylenol and NyQuil both contain acetaminophen, and most people never notice. Add every medicine and
          supplement you take, or that someone you care for takes, and Shelf Check reads their official labels
          together. It shows double doses, labels that warn about each other, and warnings meant for you, each one
          quoted from the label so you can show a pharmacist.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/add?sample=1" className="btn">
            See an example cabinet
          </Link>
          <Link href="/start" className="btn btn-quiet">
            Start my own, four questions
          </Link>
        </div>
        <p className="mt-4 text-sm text-ink-soft">
          Takes about two minutes. Your list stays in this browser. It is sent to our server only to run the check, and is not stored there.
        </p>
      </section>
    );
  }

  const labelFlags = state.status === "done" ? state.result.flags : [];
  const flags = [...(today ? supplyFlags(items, supply, today) : []), ...labelFlags].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const spoken = flags.filter((flag) => flag.severity !== "info").map((flag) => `${flag.title}. ${flag.explain}`);
  const stops = flags.filter((flag) => flag.severity === "stop").length;
  const asks = flags.filter((flag) => flag.severity === "ask").length;
  const notes = flags.filter((flag) => flag.severity === "info").length;

  return (
    <div className="pt-6 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <h1 className="sr-only">Your medicine cabinet and its warnings</h1>
      <section aria-labelledby="warnings-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="warnings-title" className="text-3xl font-extrabold narrow">
            Warnings
          </h2>
          <ReadAloud lines={spoken} />
        </div>
        <div className="facts mt-4" aria-live="polite">
          {state.status === "checking" && <p>Reading the labels of your {items.length} products together.</p>}
          {state.status === "done" && (
            <>
              <p className="text-lg font-extrabold">
                {stops > 0
                  ? `${stops} ${stops === 1 ? "thing" : "things"} to stop and check before your next dose.`
                  : asks > 0
                    ? "Nothing to stop. Some things to ask a pharmacist about."
                    : "No label here warns about another product in this cabinet."}
              </p>
              <p className="mt-1">
                {stops + asks === 0
                  ? "Labels can miss real risks. Print this list and ask a pharmacist to look it over."
                  : `${asks} to ask a pharmacist about, ${notes} ${notes === 1 ? "note" : "notes"} to read. Every one quotes the label it came from.`}
              </p>
              <div className="mt-3 flex flex-wrap gap-3">
                <Link href="/print" className="btn btn-quiet">
                  Print for your pharmacist
                </Link>
              </div>
            </>
          )}
        </div>
        {state.status === "failed" && (
          <p className="mt-4 facts" role="alert">
            {state.message}
          </p>
        )}
        {state.status === "done" && flags.length === 0 && (
          <p className="mt-4 facts">
            None of these labels warn about another product in your cabinet. A label can stay silent about a real
            risk, so this is not proof they are safe together.
          </p>
        )}
        <ul className="mt-4 grid gap-4">
          {flags.map((flag) => (
            <FlagRow key={flag.id} flag={flag} items={items} />
          ))}
        </ul>
        {state.status === "done" && state.result.unchecked.length > 0 && (
          <p className="mt-4 text-sm text-ink-soft">
            Not checked, because no official label text was found: {state.result.unchecked.join(", ")}.
          </p>
        )}
      </section>

      <section aria-labelledby="cabinet-title">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="cabinet-title" className="text-3xl font-extrabold narrow">
            Your cabinet
          </h2>
          <span className="flex gap-5">
            <Link href="/print" className="underline font-bold">
              Print list
            </Link>
            <Link href="/add" className="underline font-bold">
              Add another
            </Link>
          </span>
        </div>
        <div className="mt-4 grid gap-4">
          {items.map((item) => (
            <ProductPanel
              key={item.id}
              product={item}
              disposal={state.status === "done" ? state.result.disposal[item.id] : undefined}
              extra={<SupplyFields productId={item.id} />}
              action={
                <button type="button" className="underline font-bold" onClick={() => remove(item.id)}>
                  Remove
                </button>
              }
            />
          ))}
        </div>
      </section>
    </div>
  );
}
