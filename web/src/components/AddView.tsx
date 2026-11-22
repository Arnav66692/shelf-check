"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, fetchLabelImages, searchProducts, suggestFromPhoto } from "@/lib/api";
import { formatStrength, type Product } from "@/lib/model";
import { SAMPLE_QUERIES } from "@/lib/sample";
import { useCabinet } from "@/lib/store";
import { ProductPanel } from "./ProductPanel";

type Results =
  | { status: "idle" }
  | { status: "loading"; what: string }
  | { status: "ready"; products: readonly Product[]; note?: string; readLines?: readonly string[] }
  | { status: "failed"; message: string };

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function describe(product: Product): string {
  const strengths = product.ingredients.map((item) => `${item.name} ${formatStrength(item)}`).join(", ");
  const parts = product.form ? [strengths, product.form.toLowerCase()] : [strengths];
  return parts.filter((part) => part !== "").map(sentenceCase).join(". ");
}

function LabelPicture({ product }: { product: Product }) {
  const source = product.labelImages[0];
  if (!source) return null;
  if (source.toLowerCase().endsWith(".pdf")) {
    return (
      <object data={source} type="application/pdf" className="w-full h-[340px] border-2 border-ink bg-[var(--panel)]">
        <a className="underline font-bold" href={source} target="_blank" rel="noreferrer">
          Open the official label picture
        </a>
      </object>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- official label pictures come from DailyMed at unknown sizes
    <img
      src={source}
      alt={`Official label picture for ${product.displayName}`}
      className="w-full max-h-[340px] object-contain bg-[var(--panel)] border-2 border-ink"
    />
  );
}

export function AddView() {
  const router = useRouter();
  const params = useSearchParams();
  const { items, add, replaceAll } = useCabinet();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ status: "idle" });
  const [chosen, setChosen] = useState<Product | null>(null);
  const photoInput = useRef<HTMLInputElement>(null);
  const sampleStarted = useRef(false);
  const confirmPanel = useRef<HTMLElement>(null);

  useEffect(() => {
    if (params.get("sample") !== "1" || sampleStarted.current) return;
    sampleStarted.current = true;
    setResults({ status: "loading", what: "Loading a sample cabinet from the official records." });
    Promise.all(SAMPLE_QUERIES.map((sample) => searchProducts(sample).then((found) => found.products[0])))
      .then((products) => {
        replaceAll(products.filter((product): product is Product => Boolean(product)));
        router.replace("/");
      })
      .catch((error: unknown) =>
        setResults({ status: "failed", message: error instanceof ApiError ? error.message : "The sample could not load." }),
      );
  }, [params, replaceAll, router]);

  async function runSearch(event: React.FormEvent) {
    event.preventDefault();
    const text = query.trim();
    if (text.length < 2) return;
    setChosen(null);
    setResults({ status: "loading", what: "Searching the official records." });
    try {
      const found = await searchProducts(text);
      setResults({ status: "ready", products: found.products, note: found.note });
    } catch (error) {
      setResults({ status: "failed", message: error instanceof ApiError ? error.message : "The search could not run." });
    }
  }

  async function runPhoto(file: File | undefined) {
    if (!file) return;
    setChosen(null);
    setResults({ status: "loading", what: "Reading the photo. This is a suggestion only, you confirm it next." });
    try {
      const suggestion = await suggestFromPhoto(file);
      setResults({
        status: "ready",
        products: suggestion.products,
        readLines: suggestion.read.lines,
        note:
          suggestion.products.length === 0
            ? "The photo did not match an official record. Type the name or the code printed on the label."
            : suggestion.products.some((product) => product.readerAgreement === "verified")
              ? "The drug code and the printed ingredients both match one FDA record. Still compare it with your bottle."
              : "The reader could not confirm this two ways. Compare it carefully with your bottle.",
      });
    } catch (error) {
      setResults({ status: "failed", message: error instanceof ApiError ? error.message : "The photo could not be read." });
    }
  }

  function choose(product: Product) {
    setChosen(product);
    confirmPanel.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    if (product.labelImages.length > 0) return;
    fetchLabelImages(product)
      .then(({ images }) => setChosen((current) => (current?.id === product.id ? { ...product, labelImages: images } : current)))
      .catch(() => undefined);
  }

  function confirm(product: Product) {
    add(product);
    router.push("/");
  }

  return (
    <div className="pt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section>
        <h1 className="text-3xl font-extrabold narrow">Add a medicine</h1>
        <form onSubmit={runSearch} className="mt-4 flex flex-col sm:flex-row gap-3">
          <label className="sr-only" htmlFor="query">
            Name, drug code or barcode number
          </label>
          <input
            id="query"
            className="field"
            placeholder="Name, NDC code or barcode number"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            autoComplete="off"
          />
          <button className="btn" type="submit">
            Search
          </button>
        </form>
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="button" className="underline font-bold" onClick={() => photoInput.current?.click()}>
            Use a photo of the label
          </button>
          <input
            ref={photoInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Photo of the label"
            onChange={(event) => runPhoto(event.target.files?.[0])}
          />
          <span className="text-sm text-ink-soft">Covers prescription, over the counter and supplements.</span>
        </div>

        <div className="mt-6" aria-live="polite">
          {results.status === "loading" && <p>{results.what}</p>}
          {results.status === "failed" && (
            <p className="facts" role="alert">
              {results.message}
            </p>
          )}
          {results.status === "ready" && (
            <>
              {results.readLines && results.readLines.length > 0 && (
                <p className="mb-3 text-sm text-ink-soft">The reader saw: {results.readLines.join(" / ")}</p>
              )}
              {results.note && <p className="mb-3 text-sm">{results.note}</p>}
              {results.products.length === 0 && !results.note && <p>No official record matched. Check the spelling or try the code on the label.</p>}
              <ul className="grid gap-2">
                {results.products.map((product) => {
                  const selected = chosen?.id === product.id;
                  const owned = items.some((item) => item.id === product.id);
                  return (
                    <li key={product.id}>
                      <button
                        type="button"
                        onClick={() => choose(product)}
                        aria-pressed={selected}
                        className={`w-full text-left px-3 py-2.5 border-2 border-ink ${selected ? "bg-ink text-[var(--panel)]" : "bg-[var(--panel)] hover:bg-[var(--paper)]"}`}
                      >
                        <span className="font-extrabold">{product.displayName}</span>
                        {owned && <span className="ml-2 text-sm">In your cabinet</span>}
                        {product.readerAgreement === "verified" && <span className="ml-2 text-sm">Code and label text agree</span>}
                        <span className="block text-sm">{describe(product)}</span>
                        <span className="block text-sm opacity-80">
                          {product.maker}
                          {product.sameAsCount && product.sameAsCount > 1 ? ` and ${product.sameAsCount - 1} more makers` : ""}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </div>
      </section>

      <section aria-live="polite" ref={confirmPanel} className="scroll-mt-6">
        <h2 className="text-3xl font-extrabold narrow">Does this match your bottle?</h2>
        {!chosen && <p className="mt-4 text-ink-soft">Pick a result to see its official record here.</p>}
        {chosen && (
          <div className="mt-4 grid gap-4">
            <LabelPicture product={chosen} />
            <ProductPanel product={chosen} />
            <button type="button" className="btn" onClick={() => confirm(chosen)}>
              Yes, add it to my cabinet
            </button>
          </div>
        )}
      </section>
    </div>
  );
}
