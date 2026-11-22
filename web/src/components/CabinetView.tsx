"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ApiError, checkCabinet, type CheckResult } from "@/lib/api";
import { useCabinet, useProfile, useSupply } from "@/lib/store";
import { supplyFlags } from "@/lib/supply";
import { nextStep } from "@/lib/nextStep";
import { useToday } from "@/lib/today";
import { FlagRow } from "./FlagRow";
import { Intro } from "./Intro";
import { ProductPanel } from "./ProductPanel";
import { ReadAloud } from "./ReadAloud";
import { Reveal } from "./Reveal";
import { SeedHead } from "./SeedHead";
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
      <section className="relative -mx-4 sm:-mx-8 min-h-[calc(100svh-150px)] grid content-between gap-8 px-4 sm:px-8 pt-6 pb-4 overflow-x-clip">
        <Intro />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute left-[-10%] top-[8%] h-[38%] w-[95%] rotate-[24deg] rounded-[50%] bg-[radial-gradient(closest-side,rgba(58,104,235,0.38),rgba(40,80,210,0.12)_55%,transparent)] blur-[30px]"
        />
        <SeedHead className="pointer-events-none absolute right-[-18%] sm:right-[-4%] top-[-4%] h-[92%] w-[110%] sm:w-[68%] opacity-90" />
        <div className="relative max-w-[440px] rise" style={{ animationDelay: "calc(var(--intro-delay) + 100ms)" }}>
          <p className="text-[0.82rem] uppercase tracking-[0.1em] leading-relaxed text-ink">
            Tylenol and NyQuil both contain acetaminophen, and most people never notice. Shelf Check reads the official
            labels of everything you take together, and quotes the line that matters.
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Link href="/add?sample=1" className="btn">
              See an example cabinet
            </Link>
            <Link href="/start" className="btn btn-quiet">
              Start my own
            </Link>
          </div>
          <p className="mt-3 text-sm text-ink-soft">
            About two minutes, four questions. Your list stays in this browser. It is sent to our server only to run
            the check, and is not stored there.
          </p>
        </div>
        <div className="relative grid gap-6 lg:grid-cols-[1fr_380px] lg:items-end">
          <h1 className="font-medium uppercase leading-[0.98] tracking-[0.01em] text-leaf text-[clamp(2.4rem,7.4vw,5.6rem)]">
            <Reveal lines={["Two bottles."]} delay={60} />
            <span className="block pl-[1.2em]">
              <Reveal lines={["Same drug."]} delay={200} />
            </span>
          </h1>
          <div className="facts rise text-[0.8rem] uppercase tracking-[0.1em]" style={{ animationDelay: "calc(var(--intro-delay) + 450ms)" }}>
            <div className="flex items-center justify-between gap-3">
              <span>Example cabinet check</span>
              <span className="flex items-center gap-2 text-leaf">
                <span className="live-dot" aria-hidden="true" />
                Label quoted
              </span>
            </div>
            <p className="mt-2 text-ink-soft normal-case tracking-normal text-[0.9rem]">
              Tylenol Extra Strength and NyQuil Cold and Flu both contain acetaminophen.
            </p>
            <div className="mt-3 flex items-center gap-3">
              <span className="text-ink-soft">At label max</span>
              <span className="relative flex-1 h-px bg-[var(--rule)]">
                <span className="absolute left-0 top-[-1px] h-[3px] w-full bg-[var(--stop)] rounded-full" />
                <span className="absolute left-[71%] top-[-4px] h-[9px] w-px bg-ink" />
              </span>
            </div>
            <div className="mt-2 flex justify-between text-ink-soft tabular-nums">
              <span>
                <span className="text-[var(--stop)]">5,600 mg</span> a day
              </span>
              <span>label warns past 4,000 mg</span>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const labelFlags = state.status === "done" ? state.result.flags : [];
  const flags = [...(today ? supplyFlags(items, supply, today) : []), ...labelFlags].sort(
    (a, b) => SEVERITY_ORDER.indexOf(a.severity) - SEVERITY_ORDER.indexOf(b.severity),
  );
  const spoken = [
    ...(state.status === "done" && state.result.unchecked.length > 0
      ? [`Not checked: ${state.result.unchecked.join(", ")}. Warnings about these are missing.`]
      : []),
    ...flags.filter((flag) => flag.severity !== "info").map((flag) => `${flag.title}. ${flag.explain} What to do: ${nextStep(flag)}`),
  ];
  const stops = flags.filter((flag) => flag.severity === "stop").length;
  const asks = flags.filter((flag) => flag.severity === "ask").length;
  const notes = flags.filter((flag) => flag.severity === "info").length;
  const unchecked = state.status === "done" ? state.result.unchecked : [];

  return (
    <div className="pt-6 grid gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <h1 className="sr-only">Your medicine cabinet and its warnings</h1>
      <section aria-labelledby="warnings-title">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="warnings-title" className="text-3xl font-medium narrow">
            Warnings
          </h2>
          <ReadAloud lines={spoken} />
        </div>
        <div className="facts mt-4" aria-live="polite">
          {state.status === "checking" && <p>Reading the labels of your {items.length} products together.</p>}
          {state.status === "done" && (
            <>
              <div className="flex items-center justify-between gap-3 label">
                <span>Label check</span>
                <span className="flex items-center gap-2 text-leaf">
                  <span className="live-dot" aria-hidden="true" />
                  {items.length} {items.length === 1 ? "product" : "products"} read
                </span>
              </div>
              <p className="mt-2 text-lg font-semibold">
                {stops > 0
                  ? `${stops} ${stops === 1 ? "thing" : "things"} to check with a pharmacist before the next dose.`
                  : asks > 0
                    ? `${asks} ${asks === 1 ? "thing" : "things"} to ask a pharmacist about.`
                    : unchecked.length > 0
                      ? "Some products could not be checked, so this list is not complete."
                      : "No label here warns about another product in this cabinet."}
              </p>
              {unchecked.length > 0 && (
                <p className="mt-1 text-[var(--ask)]">
                  Not checked, because no official label text was found: {unchecked.join(", ")}. Warnings about these are
                  missing. Ask a pharmacist to look at them.
                </p>
              )}
              <p className="mt-1">
                {stops + asks === 0
                  ? "Labels can miss real risks. Print this list and ask a pharmacist to look it over."
                  : `${stops > 0 && asks > 0 ? `${asks} more to ask about, ` : ""}${notes} ${notes === 1 ? "note" : "notes"} to read. Every one quotes the label it came from.`}
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
        {state.status === "done" && flags.length === 0 && unchecked.length === 0 && (
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
      </section>

      <section aria-labelledby="cabinet-title">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="cabinet-title" className="text-3xl font-medium narrow">
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
