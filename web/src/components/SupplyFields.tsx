"use client";

import { useState } from "react";
import { countedDate, todayIso, type CountedSupply } from "@/lib/supply";
import { useSupply } from "@/lib/store";

const NUMBER_TEXT = /^(?:\d+\.?\d*|\.\d+)$/;
const INPUT_CLASS = "w-full min-w-0 border border-[var(--rule)] rounded-[6px] bg-[var(--panel)] px-2 py-1";

type CountField = "dosesLeft" | "dosesPerDay";
type Draft = { readonly text: string; readonly stored: number | undefined };

function readCount(text: string): { value: number | undefined } | { error: string } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: undefined };
  if (!NUMBER_TEXT.test(trimmed)) return { error: "Use digits and one decimal point, for example 0.5." };
  return { value: Number(trimmed) };
}

function CountInput({
  label,
  stored,
  onCommit,
}: {
  label: string;
  stored: number | undefined;
  onCommit: (value: number | undefined) => void;
}) {
  const [draft, setDraft] = useState<Draft | null>(null);
  const text = draft !== null && draft.stored === stored ? draft.text : (stored?.toString() ?? "");
  const parsed = readCount(text);
  const error = "error" in parsed ? parsed.error : null;
  return (
    <label className="grid gap-1">
      {label}
      <input
        inputMode="decimal"
        className={INPUT_CLASS}
        value={text}
        aria-invalid={error !== null}
        onChange={(event) => {
          const next = event.target.value;
          const read = readCount(next);
          const committed = "error" in read ? stored : read.value;
          setDraft({ text: next, stored: committed });
          if (!("error" in read)) onCommit(read.value);
        }}
      />
      {error && <span className="text-[var(--stop)] font-bold">{error}</span>}
    </label>
  );
}

export function SupplyFields({ productId }: { productId: string }) {
  const { supply, setSupply } = useSupply();
  const current: CountedSupply = supply[productId] ?? {};
  const update = (patch: Partial<CountedSupply>) => {
    const next: CountedSupply = { ...current, ...patch };
    setSupply(productId, next);
  };
  const countAs = (field: CountField) => (value: number | undefined) => update({ [field]: value, countedOn: todayIso() });
  const counted = countedDate(current);

  return (
    <details className="mt-2 text-ink">
      <summary className="cursor-pointer underline font-bold">Expiry and supply</summary>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <label className="grid gap-1">
          Expires
          <input
            type="month"
            className={INPUT_CLASS}
            value={current.expires ?? ""}
            onChange={(event) => update({ expires: event.target.value || undefined })}
          />
        </label>
        <CountInput label="Doses left" stored={current.dosesLeft} onCommit={countAs("dosesLeft")} />
        <CountInput label="Doses a day" stored={current.dosesPerDay} onCommit={countAs("dosesPerDay")} />
      </div>
      {counted && <p className="mt-1 text-sm text-ink-soft">Counted on {counted}. Change a number to count again from today.</p>}
    </details>
  );
}
