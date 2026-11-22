"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, checkCabinet, type CheckResult } from "@/lib/api";
import { EXAMPLE_NAME, useCabinet, useHousehold, useProfile, useSupply } from "@/lib/store";
import { supplyFlags } from "@/lib/supply";
import { nextStep } from "@/lib/nextStep";
import { useToday } from "@/lib/today";
import { FlagRow } from "./FlagRow";
import { Landing } from "./Landing";
import { ProductPanel } from "./ProductPanel";
import { ReadAloud } from "./ReadAloud";
import { SupplyFields } from "./SupplyFields";

const SEVERITY_ORDER = ["stop", "ask", "info"];

type Outcome = { status: "done"; result: CheckResult } | { status: "failed"; message: string };
type CheckState = { status: "checking" } | Outcome;

export function CabinetView() {
  const { items, remove, replaceAll } = useCabinet();
  const { active } = useHousehold();
  const addedId = useSearchParams().get("added");
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
  const bannerRef = useRef<HTMLParagraphElement>(null);
  const addedChecked = addedId !== null && state.status === "done";
  useEffect(() => {
    if (addedChecked) bannerRef.current?.focus({ preventScroll: true });
  }, [addedChecked, addedId]);

  if (items.length === 0) return <Landing />;

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
  const added = items.find((item) => item.id === addedId);
  const involvesAdded = (flag: { itemIds: readonly string[] }) => added !== undefined && flag.itemIds.includes(added.id);
  const addedAll = flags.filter(involvesAdded);
  const addedFlags = addedAll.filter((flag) => flag.severity !== "info");
  const addedNotes = addedAll.length - addedFlags.length;
  const noteText = addedNotes === 0 ? "" : addedNotes === 1 ? " 1 note mentions it." : ` ${addedNotes} notes mention it.`;
  const orderedItems = added ? [added, ...items.filter((item) => item.id !== added.id)] : items;
  const checkedCount = items.length - unchecked.length;
  const topFlag = flags.find((flag) => flag.severity === "stop") ?? flags.find((flag) => flag.severity === "ask");
  const urgent = flags.filter((flag) => flag.severity !== "info");
  const infoFlags = flags.filter((flag) => flag.severity === "info");
  const anchor = (id: string) => `#flag-${id.replace(/[^a-z0-9]+/gi, "-")}`;

  return (
    <div className="pt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
      <h1 className="sr-only">Your medicine cabinet and its warnings</h1>
      <section aria-labelledby="warnings-title" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <h2 id="warnings-title" className="text-3xl font-medium narrow">
            Warnings
          </h2>
          <ReadAloud lines={spoken} />
        </div>
        {active.name === EXAMPLE_NAME && (
          <p className="facts mt-4 flex flex-wrap items-center gap-3">
            <span>This is an example cabinet, so you can see how the warnings work.</span>
            <Link href="/start" className="btn">
              Start my own
            </Link>
          </p>
        )}
        {added && (
          <p ref={bannerRef} tabIndex={-1} className="facts mt-4 text-[1.02rem] focus:outline-none" role="status">
            Added <strong>{added.displayName}</strong>.{" "}
            {state.status !== "done"
              ? "Checking it against the rest of your cabinet."
              : addedFlags.length === 0
                ? `No warning was matched for it. This checker can miss real interactions.${noteText}`
                : `${addedFlags.length === 1 ? "1 warning involves it. It is" : `${addedFlags.length} warnings involve it. They are`} marked New.${noteText} `}
            {state.status === "done" && addedFlags.length > 0 && (
              <a
                className="underline font-bold"
                href={`#flag-${addedFlags[0].id.replace(/[^a-z0-9]+/gi, "-")}`}
                onClick={() => {
                  const target = document.getElementById(`flag-${addedFlags[0].id.replace(/[^a-z0-9]+/gi, "-")}`);
                  target?.setAttribute("tabindex", "-1");
                  window.setTimeout(() => target?.focus({ preventScroll: true }), 50);
                }}
              >
                Show {addedFlags.length === 1 ? "it" : "the first one"}
              </a>
            )}
          </p>
        )}
        <div className="facts mt-4" aria-live="polite">
          {state.status === "checking" && <p>Reading the labels of your {items.length} products together.</p>}
          {state.status === "done" && (
            <>
              <div className="flex items-center justify-between gap-3 label">
                <span>Label check</span>
                <span className="flex items-center gap-2 text-ink">
                  <span className="live-dot" aria-hidden="true" />
                  {checkedCount} of {items.length} {items.length === 1 ? "product" : "products"} checked
                </span>
              </div>
              <p className="mt-2 text-lg font-semibold">
                {stops > 0
                  ? `${stops} ${stops === 1 ? "thing" : "things"} to check with a pharmacist before the next dose.`
                  : asks > 0
                    ? `${asks} ${asks === 1 ? "thing" : "things"} to ask a pharmacist about.`
                    : unchecked.length > 0
                      ? "Some products could not be checked, so this list is not complete."
                      : "No label warning was matched in this cabinet."}
              </p>
              {unchecked.length > 0 && (
                <p className="mt-1 text-[var(--stop-text)]">
                  Not checked, because no official label text was found: {unchecked.join(", ")}. Warnings about these are
                  missing. Ask a pharmacist to look at them.
                </p>
              )}
              <p className="mt-1">
                {stops + asks === 0
                  ? "This checker can miss real interactions. Print this list and ask a pharmacist to look it over."
                  : `${stops > 0 && asks > 0 ? `${asks} more to ask about, ` : ""}${notes} ${notes === 1 ? "note" : "notes"} to read. Every one quotes the label it came from.`}
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                It only knows what the labels say. In our test it caught about 1 in 4 major drug interactions, so show this
                list to a pharmacist too.
              </p>
              {topFlag && (
                <p className="mt-4 border-t border-[var(--rule)] pt-3">
                  <span className="label">First, </span>
                  <a className="underline font-bold" href={anchor(topFlag.id)}>
                    {topFlag.title}
                  </a>
                  . {nextStep(topFlag)}
                </p>
              )}
              <div className="mt-4 flex flex-wrap gap-3">
                <Link href="/print" className="btn btn-quiet">
                  Print for your pharmacist
                </Link>
                <a href="#cabinet-title" className="btn btn-quiet">
                  See your {items.length} products
                </a>
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
          {urgent.map((flag) => (
            <FlagRow key={flag.id} flag={flag} items={items} isNew={involvesAdded(flag)} />
          ))}
        </ul>
        {infoFlags.length > 0 && (
          <details className="mt-4 border border-[var(--rule)]" open={infoFlags.some(involvesAdded) || urgent.length === 0}>
            <summary className="cursor-pointer px-6 py-4 font-[family-name:var(--font-display)] font-medium uppercase tracking-[0.15em]">
              {infoFlags.length} {infoFlags.length === 1 ? "note" : "notes"} to read, like alcohol and drowsiness
            </summary>
            <ul className="grid gap-4 px-4 pb-4">
              {infoFlags.map((flag) => (
                <FlagRow key={flag.id} flag={flag} items={items} isNew={involvesAdded(flag)} />
              ))}
            </ul>
          </details>
        )}
      </section>

      <section aria-labelledby="cabinet-title" className="min-w-0">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
          <h2 id="cabinet-title" className="text-3xl font-medium narrow">
            Your cabinet
          </h2>
          <span className="flex flex-wrap gap-x-5 gap-y-1">
            <Link href="/print" className="underline font-bold">
              Print list
            </Link>
            <Link href="/add" className="underline font-bold">
              Add another
            </Link>
            <button
              type="button"
              className="underline font-bold"
              onClick={() => {
                if (window.confirm("Remove every product from this cabinet?")) replaceAll([]);
              }}
            >
              Clear
            </button>
          </span>
        </div>
        <div className="mt-4 grid gap-4">
          {orderedItems.map((item) => (
            <ProductPanel
              key={item.id}
              product={item}
              badge={item.id === added?.id ? "New" : undefined}
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
