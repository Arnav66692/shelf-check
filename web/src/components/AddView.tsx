"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, fetchLabelImages, searchProducts, suggestFromPhoto } from "@/lib/api";
import { formatStrength, type Product } from "@/lib/model";
import sampleProducts from "@/lib/sampleProducts.json";
import { activeCabinetSize, useCabinet, useHousehold } from "@/lib/store";
import { BarcodeScanner } from "./BarcodeScanner";
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

const MAX_PICTURES = 4;
const SAMPLE_PRODUCTS = sampleProducts as unknown as readonly Product[];

function LabelPicture({ product }: { product: Product }) {
  const source = product.labelImages[0];
  if (!source) return null;
  if (source.toLowerCase().endsWith(".pdf")) {
    return (
      <object data={source} type="application/pdf" className="w-full h-[340px] border border-[var(--rule)] rounded-[6px] bg-[var(--panel)]">
        <a className="underline font-bold" href={source} target="_blank" rel="noreferrer">
          Open the official label picture
        </a>
      </object>
    );
  }
  const pictures = product.labelImages.slice(0, MAX_PICTURES);
  return (
    <figure>
      <div className={`grid gap-2 ${pictures.length > 1 ? "grid-cols-2" : ""}`}>
        {pictures.map((picture, index) => (
          // eslint-disable-next-line @next/next/no-img-element -- official label pictures come from DailyMed at unknown sizes
          <img
            key={picture}
            src={picture}
            alt={`Picture ${index + 1} from the official record for ${product.displayName}`}
            className="w-full h-[160px] object-contain bg-[var(--panel)] border border-[var(--rule)] rounded-[6px]"
            loading="lazy"
          />
        ))}
      </div>
      <figcaption className="mt-1 text-sm text-ink-soft">
        Pictures from the official record. A record can cover several strengths, so check that the label you see
        matches the strength above.
      </figcaption>
    </figure>
  );
}

export function AddView() {
  const router = useRouter();
  const params = useSearchParams();
  const { items, add, replaceAll } = useCabinet();
  const { addPerson } = useHousehold();
  const generation = useRef(0);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Results>({ status: "idle" });
  const [chosen, setChosen] = useState<Product | null>(null);
  const [scanning, setScanning] = useState(false);
  const photoInput = useRef<HTMLInputElement>(null);
  const sampleStarted = useRef(false);
  const confirmPanel = useRef<HTMLElement>(null);
  const confirmButton = useRef<HTMLButtonElement>(null);
  const chosenId = chosen?.id;

  useEffect(() => {
    if (params.get("sample") !== "1" || sampleStarted.current) return;
    sampleStarted.current = true;
    if (activeCabinetSize() > 0) addPerson("Example");
    replaceAll(SAMPLE_PRODUCTS);
    router.replace("/");
  }, [params, replaceAll, addPerson, router]);

  async function search(rawText: string) {
    const text = rawText.trim();
    if (text.length < 2) {
      setResults({ status: "failed", message: "Type a medicine name first, like warfarin or Tylenol." });
      return;
    }
    setChosen(null);
    const mine = ++generation.current;
    setResults({ status: "loading", what: "Searching the official records." });
    try {
      const found = await searchProducts(text);
      if (mine !== generation.current) return;
      setResults({ status: "ready", products: found.products, note: found.note });
    } catch (error) {
      if (mine !== generation.current) return;
      setResults({ status: "failed", message: error instanceof ApiError ? error.message : "The search could not run." });
    }
  }

  function runSearch(event: React.FormEvent) {
    event.preventDefault();
    void search(query);
  }

  function handleScan(digits: string) {
    setScanning(false);
    setQuery(digits);
    void search(digits);
  }

  async function runPhoto(file: File | undefined) {
    if (!file) return;
    setChosen(null);
    const mine = ++generation.current;
    setResults({ status: "loading", what: "Reading the photo. This is a suggestion only, you confirm it next." });
    try {
      const suggestion = await suggestFromPhoto(file);
      if (mine !== generation.current) return;
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
      if (mine !== generation.current) return;
      setResults({ status: "failed", message: error instanceof ApiError ? error.message : "The photo could not be read." });
    }
  }

  function choose(product: Product) {
    setChosen(product);
    if (product.labelImages.length > 0) return;
    fetchLabelImages(product)
      .then(({ images }) => setChosen((current) => (current?.id === product.id ? { ...product, labelImages: images } : current)))
      .catch(() => undefined);
  }

  useEffect(() => {
    if (!chosenId) return;
    confirmButton.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    confirmButton.current?.focus({ preventScroll: true });
  }, [chosenId]);

  function confirm(product: Product) {
    add(product);
    router.push("/");
  }

  return (
    <div className="pt-6 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section>
        <h1 className="text-3xl font-medium narrow">Add a medicine</h1>
        <form onSubmit={runSearch} className="mt-4 flex flex-col sm:flex-row gap-3">
          <label className="sr-only" htmlFor="query">
            Name, drug code or barcode number
          </label>
          <input
            id="query"
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
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2">
          <button type="button" className="underline font-bold" onClick={() => setScanning(true)}>
            Scan the barcode
          </button>
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

        {scanning && (
          <div className="mt-4">
            <BarcodeScanner onScan={handleScan} onClose={() => setScanning(false)} />
          </div>
        )}

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
                        className={`w-full text-left px-3 py-2.5 border border-[var(--rule)] rounded-[6px] ${selected ? "bg-leaf text-[var(--on-bright)]" : "bg-[var(--panel)] hover:border-leaf"}`}
                      >
                        <span className="font-semibold">{product.displayName}</span>
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
        <h2 className="text-3xl font-medium narrow">Does this match your bottle?</h2>
        {!chosen && <p className="mt-4 text-ink-soft">Pick a result to see its official record here.</p>}
        {chosen && (
          <div className="mt-4 grid gap-4">
            <button ref={confirmButton} type="button" className="btn" onClick={() => confirm(chosen)}>
              Yes, add it to my cabinet
            </button>
            <ProductPanel product={chosen} />
            <LabelPicture product={chosen} />
          </div>
        )}
      </section>
    </div>
  );
}
