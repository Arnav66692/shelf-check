"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { ApiError, searchProducts } from "@/lib/api";
import { formatStrength, type Product } from "@/lib/model";
import { useCabinet } from "@/lib/store";
import { LABEL_ONLY_NOTE, learnHref } from "./copy";

type Results =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ready"; products: readonly Product[]; note?: string }
  | { status: "failed"; message: string };

function strengths(product: Product): string {
  const text = product.ingredients.map((ingredient) => `${ingredient.name} ${formatStrength(ingredient)}`).join(", ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function uniqueBySetId(products: readonly Product[]): readonly Product[] {
  const seen = new Set<string>();
  return products.filter((product) => {
    const setId = product.record?.splSetId?.toLowerCase();
    if (!setId) return true;
    if (seen.has(setId)) return false;
    seen.add(setId);
    return true;
  });
}

function ProductLink({ product, owned = false }: { product: Product; owned?: boolean }) {
  const setId = product.record?.splSetId;
  const body = (
    <>
      <span className="block font-semibold text-ink">
        {product.displayName}
        {owned && <span className="ml-3 label">In your cabinet</span>}
      </span>
      {product.ingredients.length > 0 && <span className="block text-sm">{strengths(product)}</span>}
      <span className="block text-sm text-ink-soft">{setId ? product.maker : "No FDA label on file for this one, so there is nothing to quote."}</span>
    </>
  );
  if (!setId) return <div className="facts">{body}</div>;
  return (
    <Link href={learnHref(setId)} className="facts block transition-colors hover:border-[var(--accent)]">
      {body}
      <span className="mt-2 block label text-[var(--accent)]">Read what the label says</span>
    </Link>
  );
}

export function LearnIndex() {
  const { items } = useCabinet();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ status: "idle" });
  const generation = useRef(0);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) {
      setResults({ status: "failed", message: "Type a medicine name first, like warfarin or Tylenol." });
      return;
    }
    const mine = ++generation.current;
    setResults({ status: "loading" });
    try {
      const found = await searchProducts(text);
      if (mine !== generation.current) return;
      setResults({ status: "ready", products: uniqueBySetId(found.products), note: found.note });
    } catch (error) {
      if (mine !== generation.current) return;
      setResults({ status: "failed", message: error instanceof ApiError ? error.message : "The search could not run." });
    }
  }

  const ownedSetIds = new Set(items.flatMap((item) => (item.record?.splSetId ? [item.record.splSetId.toLowerCase()] : [])));

  return (
    <div className="pt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section aria-labelledby="learn-title" className="min-w-0">
        <h1 id="learn-title" className="text-3xl font-medium narrow">
          Learning center
        </h1>
        <p className="mt-3">
          Pick a medicine to read what its official FDA label says, one topic at a time. What it is for, how to take it,
          food and drink, side effects and who should not take it.
        </p>
        <p className="mt-2 text-sm text-ink-soft">{LABEL_ONLY_NOTE}</p>
        <h2 className="mt-8 label hud-bar">Your cabinet</h2>
        {items.length === 0 ? (
          <p className="mt-3 facts">
            Your cabinet is empty. Look up a medicine here, or{" "}
            <Link href="/add" className="underline font-bold">
              add one to your cabinet
            </Link>
            .
          </p>
        ) : (
          <ul className="mt-3 grid gap-3">
            {items.map((item) => (
              <li key={item.id}>
                <ProductLink product={item} />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="learn-search-title" className="min-w-0">
        <h2 id="learn-search-title" className="text-3xl font-medium narrow">
          Look up a medicine
        </h2>
        <p className="mt-3">For a medicine you do not own yet.</p>
        <form onSubmit={runSearch} className="mt-4 flex flex-col sm:flex-row gap-3" role="search">
          <label className="sr-only" htmlFor="learn-query">
            Medicine name or the code on the label
          </label>
          <input
            id="learn-query"
            className="field"
            placeholder="Medicine name or the code on the label"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
        <div className="mt-6" aria-live="polite">
          {results.status === "loading" && <p>Searching the official records.</p>}
          {results.status === "failed" && (
            <p className="facts" role="alert">
              {results.message}
            </p>
          )}
          {results.status === "ready" && (
            <>
              {results.note && <p className="mb-3 text-sm">{results.note}</p>}
              {results.products.length === 0 && !results.note && (
                <p>No official record matched. Check the spelling or try the code on the label.</p>
              )}
              <ul className="grid gap-3">
                {results.products.map((product) => (
                  <li key={product.id}>
                    <ProductLink
                      product={product}
                      owned={ownedSetIds.has(product.record?.splSetId?.toLowerCase() ?? "")}
                    />
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
