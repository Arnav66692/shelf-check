"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import sampleProducts from "@/lib/sampleProducts.json";
import type { Product } from "@/lib/model";
import { EXAMPLE_NAME, leaveExample, openExample, useHousehold } from "@/lib/store";

const SAMPLE_PRODUCTS = sampleProducts as unknown as readonly Product[];

export function PersonSwitcher() {
  const { people, active, select, addPerson, removeActive, canAdd } = useHousehold();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (name.trim() === "") return;
    addPerson(name.trim());
    setName("");
    setAdding(false);
    router.push("/start");
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.78rem] uppercase tracking-[0.12em] text-ink-soft">
      <label className="flex items-center gap-2 font-medium">
        Cabinet of
        <select
          className="border border-[var(--rule)] bg-[var(--panel)] px-2 py-1 font-normal normal-case tracking-normal text-ink text-sm"
          value={active.id}
          onChange={(event) => select(event.target.value)}
        >
          {people.map((person) => (
            <option key={person.id} value={person.id}>
              {person.name}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        role="switch"
        aria-checked={active.name === EXAMPLE_NAME}
        onClick={() => (active.name === EXAMPLE_NAME ? leaveExample() : openExample(SAMPLE_PRODUCTS))}
        className="flex items-center gap-2 font-medium hover:text-ink"
      >
        <span className={`relative inline-block h-[18px] w-[34px] rounded-full border transition-colors duration-300 ${active.name === EXAMPLE_NAME ? "border-[var(--accent)] bg-[var(--accent)]" : "border-[var(--rule)]"}`} aria-hidden="true">
          <span className={`absolute top-[2px] h-3 w-3 rounded-full bg-[var(--ink)] transition-[left] duration-300 ${active.name === EXAMPLE_NAME ? "left-[18px]" : "left-[2px]"}`} />
        </span>
        Pre-built cabinet
      </button>
      {adding ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="person-name">
            Name of the person
          </label>
          <input
            id="person-name"
            className="border border-[var(--rule)] bg-[var(--panel)] px-2 py-1"
            placeholder="Name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            autoFocus
            maxLength={30}
          />
          <button type="submit" className="underline font-medium hover:text-ink">
            Create cabinet
          </button>
          <button type="button" className="underline" onClick={() => setAdding(false)}>
            Cancel
          </button>
        </form>
      ) : (
        <>
          {canAdd && (
            <button type="button" className="underline font-medium hover:text-ink" onClick={() => setAdding(true)}>
              Add someone you care for
            </button>
          )}

          {people.length > 1 && active.name !== EXAMPLE_NAME && (
            <button
              type="button"
              className="underline"
              onClick={() => {
                if (window.confirm(`Remove ${active.name} and everything in that cabinet?`)) removeActive();
              }}
            >
              Remove {active.name}
            </button>
          )}
        </>
      )}
    </div>
  );
}
