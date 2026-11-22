"use client";

import { useSupply, type Supply } from "@/lib/store";

function toNumber(text: string): number | undefined {
  const digits = text.replace(/[^\d.]/g, "");
  return digits === "" ? undefined : Number(digits);
}

export function SupplyFields({ productId }: { productId: string }) {
  const { supply, setSupply } = useSupply();
  const current: Supply = supply[productId] ?? {};
  const update = (patch: Partial<Supply>) => setSupply(productId, { ...current, ...patch });

  return (
    <details className="mt-2 text-ink">
      <summary className="cursor-pointer underline font-bold">Expiry and supply</summary>
      <div className="mt-2 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
        <label className="grid gap-1">
          Expires
          <input
            type="month"
            className="w-full min-w-0 border border-[var(--rule)] rounded-[6px] bg-[var(--panel)] px-2 py-1"
            value={current.expires ?? ""}
            onChange={(event) => update({ expires: event.target.value || undefined })}
          />
        </label>
        <label className="grid gap-1">
          Doses left
          <input
            inputMode="numeric"
            className="w-full min-w-0 border border-[var(--rule)] rounded-[6px] bg-[var(--panel)] px-2 py-1"
            value={current.dosesLeft ?? ""}
            onChange={(event) => update({ dosesLeft: toNumber(event.target.value) })}
          />
        </label>
        <label className="grid gap-1">
          Doses a day
          <input
            inputMode="decimal"
            className="w-full min-w-0 border border-[var(--rule)] rounded-[6px] bg-[var(--panel)] px-2 py-1"
            value={current.dosesPerDay ?? ""}
            onChange={(event) => update({ dosesPerDay: toNumber(event.target.value) })}
          />
        </label>
      </div>
    </details>
  );
}
