"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useHousehold } from "@/lib/store";
import { TextSizeToggle } from "./TextSizeToggle";

export function PersonSwitcher() {
  const { people, active, select, addPerson, removeActive, canAdd } = useHousehold();
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");

  function submit(event: React.FormEvent) {
    event.preventDefault();
    addPerson(name);
    setName("");
    setAdding(false);
    router.push("/start");
  }

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-[0.78rem] uppercase tracking-[0.12em] text-ink-soft">
      <label className="flex items-center gap-2 font-medium">
        Cabinet of
        <select
          className="border border-[var(--rule)] rounded-[6px] bg-[var(--panel)] px-2 py-1 font-normal normal-case tracking-normal text-ink text-sm"
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
      {adding ? (
        <form onSubmit={submit} className="flex items-center gap-2">
          <label className="sr-only" htmlFor="person-name">
            Name of the person
          </label>
          <input
            id="person-name"
            className="border border-[var(--rule)] rounded-[6px] bg-[var(--panel)] px-2 py-1"
            placeholder="Name"
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
          <TextSizeToggle />
          {people.length > 1 && (
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
