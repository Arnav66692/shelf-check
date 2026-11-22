"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, checkSymptoms, fetchPossibleCauses, type CausesResult, type SymptomResult } from "@/lib/api";
import type { Product, Profile } from "@/lib/model";
import { useCabinet, useHousehold, useProfile } from "@/lib/store";
import { FlagRow } from "./FlagRow";

const MAX_TEXT_LENGTH = 400;
const TOO_LONG = `Please describe how you feel in ${MAX_TEXT_LENGTH} characters or fewer, so every word can be checked.`;

type HiddenMatch = { readonly itemId: string; readonly reason: string };
type FullResult = SymptomResult & {
  readonly poison?: boolean;
  readonly selfHarm?: boolean;
  readonly childDoctor?: boolean;
  readonly forChild?: boolean;
  readonly hidden?: readonly HiddenMatch[];
  readonly unchecked?: readonly string[];
};

type Outcome =
  | { status: "loading" }
  | { status: "done"; result: FullResult }
  | { status: "failed"; message: string };

type Causes = CausesResult | "loading";

type Run = { readonly asked: string; readonly key: string; readonly generation: number; readonly outcome: Outcome; readonly causes: Causes | null };

function contextKey(text: string, personId: string, items: readonly Product[], profile: Profile): string {
  return JSON.stringify([text, personId, items.map((item) => item.id), profile]);
}

function ChildDoctor() {
  return (
    <section className="facts" role="alert" style={{ borderColor: "var(--stop)" }}>
      <h2 className="facts-title" style={{ borderColor: "var(--stop)", color: "var(--stop-text)" }}>
        Call your child&apos;s doctor now
      </h2>
      <p className="mt-3 text-lg font-bold">
        A baby under 3 months old with a fever, or any baby this young who seems unwell, needs a doctor today.
      </p>
      <p className="mt-2 font-bold">
        If the baby is under 4 weeks old and has a temperature of 100.4 F (38 C) or higher, go to the emergency room
        now. Do not wait for a call back.
      </p>
      <p className="mt-2">
        Do not give a medicine from the cabinet first. If the baby is hard to wake, breathing fast or has blue lips, call
        911. For a possible poisoning, call Poison Help at 1-800-222-1222.
      </p>
    </section>
  );
}

function Emergency({ poison, selfHarm }: { poison: boolean; selfHarm: boolean }) {
  return (
    <section className="facts" role="alert" style={{ borderColor: "var(--stop)" }}>
      <h2 className="facts-title" style={{ borderColor: "var(--stop)", color: "var(--stop-text)" }}>
        This can be an emergency
      </h2>
      {poison && (
        <p className="mt-3 text-lg font-bold">
          Possible poisoning or overdose: call Poison Help now at{" "}
          <a className="underline" href="tel:18002221222">
            1-800-222-1222
          </a>
          . If the person is not awake, not breathing, or having a seizure, call 911.
        </p>
      )}
      {poison && (
        <p className="mt-2">
          If they are very sleepy or breathing slowly after pain pills or other opioids, give naloxone (Narcan) now if
          you have it, then call 911.
        </p>
      )}
      {selfHarm && (
        <p className="mt-3 text-lg font-bold">
          If you are thinking about hurting yourself, call or text{" "}
          <a className="underline" href="tel:988">
            988
          </a>{" "}
          to reach the Suicide and Crisis Lifeline, any time. If you are in danger right now, call 911.
        </p>
      )}
      {!poison && !selfHarm && <p className="mt-3 text-lg font-bold">Call 911 or your local emergency number now.</p>}
      <p className="mt-2">
        Do not wait to see whether a medicine at home helps. Poison Help in the United States is 1-800-222-1222.
      </p>
    </section>
  );
}

function CausesList({ causes }: { causes: Causes | null }) {
  if (causes === null) return null;
  if (causes !== "loading" && causes.causes.length === 0) return null;
  return (
    <section>
      <h2 className="text-2xl font-medium narrow">Possible causes to ask a doctor about</h2>
      <p className="mt-2 text-sm">
        Not a diagnosis and not professional medical advice. A language model wrote this list from your words alone. It
        cannot examine you and it can be wrong. Answers that talk about taking or changing a medicine are left out.
      </p>
      {causes === "loading" && <p className="mt-2 text-ink-soft">Thinking about possible causes.</p>}
      {causes !== "loading" && causes.note && <p className="mt-2 text-sm text-ink-soft">{causes.note}</p>}
      <ul className="mt-3 grid gap-2">
        {(causes !== "loading" ? causes.causes : []).map((cause) => (
          <li key={cause.name} className="py-2 border-b border-hair">
            <span className="font-semibold">{cause.name}.</span> {cause.why}
          </li>
        ))}
      </ul>
    </section>
  );
}

function WarningsFor({ itemId, flags }: { itemId: string; flags: FullResult["flags"] }) {
  const involved = flags.filter((flag) => flag.itemIds.includes(itemId) && flag.severity !== "info");
  if (involved.length === 0) return null;
  const urgent = involved.some((flag) => flag.severity === "stop");
  return (
    <p className="mt-2 flex flex-wrap items-center gap-2 font-semibold">
      <span
        className={`rounded-full px-2 py-0.5 font-[family-name:var(--font-space)] text-[11px] font-bold uppercase ${urgent ? "bg-[var(--stop)] text-[#191a1e]" : "bg-[var(--ask)] text-[#191a1e]"}`}
      >
        {urgent ? "Check now" : "Ask first"}
      </span>
      {involved.length === 1 ? "1 warning involves this product." : `${involved.length} warnings involve this product.`}{" "}
      <a className="underline" href="#before-you-take">
        Read before you take it
      </a>
    </p>
  );
}

function Matches({ result, items }: { result: FullResult; items: readonly Product[] }) {
  const hidden = result.hidden ?? [];
  const nameOf = (id: string) => items.find((candidate) => candidate.id === id)?.displayName ?? "A product you own";
  return (
    <section>
      <h2 className="text-2xl font-medium narrow">In your cabinet for this</h2>
      {items.length === 0 && (
        <p className="mt-2">
          Your cabinet is empty. <Link className="underline font-bold" href="/add">Add what you own</Link> first.
        </p>
      )}
      {items.length > 0 && result.matches.length === 0 && hidden.length === 0 && (
        <p className="mt-2">
          None of your labels list this under Uses. Ask a pharmacist what is safe for this, and call a doctor if it gets
          worse or does not get better.
        </p>
      )}
      <ul className="mt-3 grid gap-3">
        {result.matches.map((match) => (
          <li key={match.itemId} className="facts">
            <h3 className="text-lg font-semibold">{nameOf(match.itemId)}</h3>
            <blockquote className="quote mt-2">{match.uses}</blockquote>
            <p className="mt-1 text-sm text-ink-soft">From the Uses section of its label.</p>
            <WarningsFor itemId={match.itemId} flags={result.flags} />
          </li>
        ))}
      </ul>
      {hidden.length > 0 && (
        <div className="facts mt-3">
          <h3 className="facts-head">Left out for this age</h3>
          <ul className="mt-2 grid gap-2">
            {hidden.map((entry) => (
              <li key={entry.itemId}>
                <span className="font-semibold">{nameOf(entry.itemId)}.</span> {entry.reason}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

export function SymptomsView() {
  const { items } = useCabinet();
  const { profile } = useProfile();
  const { active } = useHousehold();
  const [text, setText] = useState("");
  const [inputError, setInputError] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const generation = useRef(0);
  const tooLong = text.trim().length > MAX_TEXT_LENGTH;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const asked = text.trim();
    if (asked.length > MAX_TEXT_LENGTH) {
      setInputError(TOO_LONG);
      return;
    }
    if (asked.length < 3) {
      setInputError("Say how you feel in a few words, like headache and a stuffy nose.");
      return;
    }
    setInputError(null);
    generation.current += 1;
    const mine = generation.current;
    const key = contextKey(asked, active.id, items, profile);
    const isCurrent = () => generation.current === mine;
    setRun({ asked, key, generation: mine, outcome: { status: "loading" }, causes: null });
    try {
      const found = (await checkSymptoms(asked, items, profile)) as FullResult;
      if (!isCurrent()) return;
      const wantsCauses = !found.emergency && !found.childDoctor;
      setRun({ asked, key, generation: mine, outcome: { status: "done", result: found }, causes: wantsCauses ? "loading" : null });
      if (!wantsCauses) return;
      const causes = await fetchPossibleCauses(asked).catch(
        (error: unknown): CausesResult => ({
          causes: [],
          note: error instanceof ApiError ? error.message : "The list of possible causes could not load.",
        }),
      );
      if (!isCurrent()) return;
      setRun((current) => (current && current.generation === mine ? { ...current, causes } : current));
    } catch (error) {
      if (!isCurrent()) return;
      setRun({
        asked,
        key,
        generation: mine,
        outcome: { status: "failed", message: error instanceof ApiError ? error.message : "The check could not run." },
        causes: null,
      });
    }
  }

  const currentKey = run ? contextKey(run.asked, active.id, items, profile) : null;
  const visible = run && run.key === currentKey ? run : null;
  const stale = run !== null && visible === null;
  const result = visible?.outcome.status === "done" ? visible.outcome.result : null;
  const unchecked = result?.unchecked ?? [];

  return (
    <div className="pt-6 max-w-[860px]">
      <h1 className="text-3xl font-medium narrow">What do you have for this?</h1>
      <p className="mt-3">
        Say how you feel. Shelf Check looks through the labels of what you already own for products labelled for it,
        and shows the warnings that apply before you take one.
      </p>
      <form onSubmit={submit} className="mt-5 flex flex-col sm:flex-row gap-3">
        <label className="sr-only" htmlFor="symptoms">
          How you feel
        </label>
        <input
          id="symptoms"
          className="field"
          placeholder="headache and a stuffy nose since last night"
          value={text}
          aria-invalid={tooLong}
          aria-describedby="symptoms-count"
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn" type="submit">
          Check
        </button>
      </form>
      <p id="symptoms-count" className={`mt-1 text-sm ${tooLong ? "font-bold text-[var(--stop-text)]" : "text-ink-soft"}`}>
        {text.trim().length} of {MAX_TEXT_LENGTH} characters.{tooLong ? ` ${TOO_LONG}` : ""}
      </p>

      <div className="mt-6 grid gap-6" aria-live="polite">
        {inputError && (
          <p className="facts" role="alert">
            {inputError}
          </p>
        )}
        {stale && <p className="text-ink-soft">The person, cabinet or profile changed. Press Check again to see results for them.</p>}
        {visible?.outcome.status === "loading" && <p>Reading your labels.</p>}
        {visible?.outcome.status === "failed" && (
          <p className="facts" role="alert">
            {visible.outcome.message}
          </p>
        )}

        {result?.emergency && <Emergency poison={result.poison === true} selfHarm={result.selfHarm === true} />}
        {result && !result.emergency && result.childDoctor && <ChildDoctor />}

        {result && !result.emergency && !result.childDoctor && (
          <>
            {result.forChild && (
              <p className="facts">
                This list is for {active.name}. If it is for a child, switch to their profile and set their age first, so
                products not meant for their age are left out.
              </p>
            )}
            {unchecked.length > 0 && (
              <p className="facts font-bold">
                Not checked, because no official label text was found: {unchecked.join(", ")}. Their uses and warnings are
                not included below.
              </p>
            )}
            <Matches result={result} items={items} />
            {result.flags.length > 0 && (
              <section id="before-you-take">
                <h2 className="text-2xl font-medium narrow">Before you take one</h2>
                <ul className="mt-3 grid gap-3">
                  {result.flags.map((flag) => (
                    <FlagRow key={flag.id} flag={flag} items={items} />
                  ))}
                </ul>
              </section>
            )}
            <CausesList causes={visible?.causes ?? null} />
          </>
        )}
      </div>
    </div>
  );
}
