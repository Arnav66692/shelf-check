"use client";

import Link from "next/link";
import { useState } from "react";
import { ApiError, checkSymptoms, fetchPossibleCauses, type CausesResult, type SymptomResult } from "@/lib/api";
import { useCabinet, useProfile } from "@/lib/store";
import { FlagRow } from "./FlagRow";

type State =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: SymptomResult }
  | { status: "failed"; message: string };

export function SymptomsView() {
  const { items } = useCabinet();
  const { profile } = useProfile();
  const [text, setText] = useState("");
  const [state, setState] = useState<State>({ status: "idle" });
  const [causes, setCauses] = useState<CausesResult | "loading" | null>(null);

  async function run(event: React.FormEvent) {
    event.preventDefault();
    if (text.trim().length < 3) {
      setState({ status: "failed", message: "Say how you feel in a few words, like headache and a stuffy nose." });
      return;
    }
    const asked = text.trim();
    setState({ status: "loading" });
    setCauses(null);
    try {
      const found = await checkSymptoms(asked, items, profile);
      setState({ status: "done", result: found });
      if (found.emergency) return;
      setCauses("loading");
      fetchPossibleCauses(asked)
        .then(setCauses)
        .catch(() => setCauses({ causes: [], note: "The list of possible causes could not load." }));
    } catch (error) {
      setState({ status: "failed", message: error instanceof ApiError ? error.message : "The check could not run." });
    }
  }

  const result = state.status === "done" ? state.result : null;

  return (
    <div className="pt-6 max-w-[860px]">
      <h1 className="text-3xl font-extrabold narrow">What do you have for this?</h1>
      <p className="mt-3">
        Say how you feel. Shelf Check looks through the labels of what you already own for products labelled for it,
        and shows the warnings that apply before you take one.
      </p>
      <form onSubmit={run} className="mt-5 flex flex-col sm:flex-row gap-3">
        <label className="sr-only" htmlFor="symptoms">
          How you feel
        </label>
        <input
          id="symptoms"
          className="field"
          placeholder="headache and a stuffy nose since last night"
          value={text}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn" type="submit">
          Check
        </button>
      </form>

      <div className="mt-6 grid gap-6" aria-live="polite">
        {state.status === "loading" && <p>Reading your labels.</p>}
        {state.status === "failed" && (
          <p className="facts" role="alert">
            {state.message}
          </p>
        )}

        {result?.emergency && (
          <section className="facts" role="alert" style={{ borderColor: "var(--stop)" }}>
            <h2 className="facts-title" style={{ borderColor: "var(--stop)", color: "var(--stop)" }}>
              This can be an emergency
            </h2>
            <p className="mt-3 text-lg font-bold">Call 911 or your local emergency number now.</p>
            <p className="mt-2">
              For a possible poisoning or overdose in the United States, Poison Control is 1-800-222-1222. Do not wait
              to see whether a medicine at home helps.
            </p>
          </section>
        )}

        {result && !result.emergency && (
          <>
            <section>
              <h2 className="text-2xl font-extrabold narrow">In your cabinet for this</h2>
              {items.length === 0 && (
                <p className="mt-2">
                  Your cabinet is empty. <Link className="underline font-bold" href="/add">Add what you own</Link> first.
                </p>
              )}
              {items.length > 0 && result.matches.length === 0 && (
                <p className="mt-2">None of your labels list this under Uses.</p>
              )}
              <ul className="mt-3 grid gap-3">
                {result.matches.map((match) => {
                  const item = items.find((candidate) => candidate.id === match.itemId);
                  return (
                    <li key={match.itemId} className="facts">
                      <h3 className="text-lg font-extrabold">{item?.displayName ?? "A product you own"}</h3>
                      <blockquote className="quote mt-2">{match.uses}</blockquote>
                      <p className="mt-1 text-sm text-ink-soft">From the Uses section of its label.</p>
                    </li>
                  );
                })}
              </ul>
            </section>

            {result.flags.length > 0 && (
              <section>
                <h2 className="text-2xl font-extrabold narrow">Before you take one</h2>
                <ul className="mt-3 grid gap-3">
                  {result.flags.map((flag) => (
                    <FlagRow key={flag.id} flag={flag} items={items} />
                  ))}
                </ul>
              </section>
            )}

            {(causes === "loading" || (causes !== null && causes.causes.length > 0)) && (
            <section>
              <h2 className="text-2xl font-extrabold narrow">Possible causes to ask a doctor about</h2>
              <p className="mt-2 text-sm">
                Not a diagnosis and not professional medical advice. A language model wrote this list from your words
                alone. It cannot examine you and it can be wrong.
              </p>
              {causes === "loading" && <p className="mt-2 text-ink-soft">Thinking about possible causes.</p>}

              <ul className="mt-3 grid gap-2">
                {(causes !== "loading" && causes ? causes.causes : []).map((cause) => (
                  <li key={cause.name} className="py-2 border-b border-hair">
                    <span className="font-extrabold">{cause.name}.</span> {cause.why}
                  </li>
                ))}
              </ul>
            </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
