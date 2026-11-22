"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { searchProducts } from "@/lib/api";
import type { Product } from "@/lib/model";
import { SHELF_TEST, SHELF_THRESHOLD } from "@/lib/matcherScore";
import { useCabinet } from "@/lib/store";
import { nextZephyrId, zephyrWorker } from "@/lib/zephyr";
import { BarcodeScanner } from "./BarcodeScanner";
import type { PhotoMatch } from "./PhotoMatcher";

type Found = { readonly product: Product; readonly source: "Zephyr" | "Barcode"; readonly checked: boolean };
type Mode = "choose" | "shelf" | "barcodes";

type WorkerMessage =
  | { type: "progress"; id?: number; stage: string; done?: number; total?: number; loaded?: number; total_bytes?: number }
  | { type: "done"; id: number; matches: PhotoMatch[] }
  | { type: "error"; id: number; message: string };

async function officialRecord(query: string): Promise<Product | null> {
  try {
    const result = await searchProducts(query);
    return result.products[0] ?? null;
  } catch {
    return null;
  }
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function CabinetScan({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const { items, add } = useCabinet();
  const [mode, setMode] = useState<Mode>("choose");
  const [found, setFound] = useState<Found[]>([]);
  const [status, setStatus] = useState("");
  const [progress, setProgress] = useState(0);
  const [scannerKey, setScannerKey] = useState(0);
  const [preview, setPreview] = useState("");
  const shelfInput = useRef<HTMLInputElement>(null);
  const runId = useRef(0);
  const seenCodes = useRef(new Set<string>());

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function remember(product: Product, source: Found["source"]) {
    setFound((current) => (current.some((item) => item.product.id === product.id) ? current : [...current, { product, source, checked: !items.some((owned) => owned.id === product.id) }]));
  }

  function runShelf(file: File) {
    setMode("shelf");
    setPreview(URL.createObjectURL(file));
    setProgress(0);
    setStatus("Waking Zephyr");
    const id = nextZephyrId();
    runId.current = id;
    const target = zephyrWorker();
    function onMessage(event: MessageEvent<WorkerMessage>) {
      const data = event.data;
      if (data.id !== undefined && data.id !== runId.current) return;
      if (data.type === "progress" && data.stage === "crop" && data.done && data.total) {
        setProgress(data.done / data.total);
        setStatus(`Zephyr is checking part ${data.done} of ${data.total} of the photo`);
      } else if (data.type === "done") {
        target.removeEventListener("message", onMessage);
        setProgress(1);
        if (data.matches.length === 0) {
          setStatus("Zephyr did not find a product it was sure of. Try a closer photo, or scan the barcodes.");
          return;
        }
        setStatus(`Zephyr found ${data.matches.length}. Getting the official records.`);
        void Promise.all(data.matches.map((match) => officialRecord(match.ndc || match.name))).then((records) => {
          records.forEach((record) => record && remember(record, "Zephyr"));
          setStatus("Untick anything that is not on your shelf, then add the rest.");
        });
      } else if (data.type === "error") {
        target.removeEventListener("message", onMessage);
        setStatus("Zephyr could not run in this browser. Scan the barcodes instead.");
      }
    }
    target.addEventListener("message", onMessage);
    target.postMessage({ id, blob: file, mode: "shelf", threshold: SHELF_THRESHOLD });
  }

  async function onBarcode(digits: string) {
    setScannerKey((key) => key + 1);
    if (seenCodes.current.has(digits)) return;
    seenCodes.current.add(digits);
    setStatus(`Looking up ${digits}`);
    const record = await officialRecord(digits);
    if (record) {
      remember(record, "Barcode");
      setStatus(`Added ${record.displayName}. Point the camera at the next barcode.`);
    } else {
      setStatus(`No official record for ${digits}. Point the camera at the next barcode.`);
    }
  }

  function addAll() {
    const chosen = found.filter((item) => item.checked);
    chosen.forEach((item) => add(item.product));
    router.push(chosen.length ? `/?added=${encodeURIComponent(chosen[chosen.length - 1].product.id)}` : "/");
  }

  const checkedCount = found.filter((item) => item.checked).length;

  return (
    <section className="facts mt-6" aria-labelledby="scan-title">
      <div className="flex items-center justify-between gap-3">
        <h2 id="scan-title" className="facts-title !border-0 !pb-0">Scan your whole cabinet</h2>
        <button type="button" className="label underline" onClick={onClose}>
          Close
        </button>
      </div>

      {mode === "choose" && (
        <div className="mt-5 grid gap-5 sm:grid-cols-2">
          <div>
            <button type="button" className="btn w-full justify-start" onClick={() => shelfInput.current?.click()}>
              Photo of a shelf
            </button>
            <p className="mt-2 text-sm text-ink-soft">One photo of several boxes, fronts facing you. Zephyr looks at 20 parts of it on this device.</p>
          </div>
          <div>
            <button type="button" className="btn btn-quiet w-full justify-start" onClick={() => setMode("barcodes")}>
              Barcodes one after another
            </button>
            <p className="mt-2 text-sm text-ink-soft">Hold up each box in turn. The camera stays on and adds every code it reads.</p>
          </div>
          <input
            ref={shelfInput}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            aria-label="Photo of a shelf"
            tabIndex={-1}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) runShelf(file);
            }}
          />
        </div>
      )}

      {mode === "shelf" && preview && (
        <div className="relative mt-5 max-h-[300px] overflow-hidden border-b border-[var(--hair)]">
          <img src={preview} alt="Your shelf photo" className="w-full object-cover opacity-80" />
          {progress < 1 && <div aria-hidden="true" className="scanline" />}
        </div>
      )}

      {mode === "barcodes" && (
        <div className="mt-5">
          <BarcodeScanner key={scannerKey} onScan={(digits) => void onBarcode(digits)} onClose={() => setMode("choose")} />
        </div>
      )}

      {status && (
        <div className="mt-4" role="status" aria-live="polite">
          <p className="label hud-bar !text-ink">{status}</p>
          {mode === "shelf" && progress < 1 && (
            <div className="mt-3 h-px bg-[var(--hair)]" aria-hidden="true">
              <div className="h-px bg-[var(--accent)] transition-[width] duration-300" style={{ width: `${Math.round(progress * 100)}%` }} />
            </div>
          )}
        </div>
      )}

      {found.length > 0 && (
        <>
          <ul className="mt-5">
            {found.map((item, index) => {
              const owned = items.some((entry) => entry.id === item.product.id);
              return (
                <li key={item.product.id} className="row-item">
                  <label className="flex items-start gap-3 py-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-1 h-5 w-5 accent-[var(--accent)]"
                      checked={item.checked}
                      onChange={() => setFound((current) => current.map((entry, i) => (i === index ? { ...entry, checked: !entry.checked } : entry)))}
                    />
                    <span className="min-w-0">
                      <span className="block font-semibold">{titleCase(item.product.displayName)}</span>
                      <span className="block text-sm text-ink-soft">
                        {item.product.ingredients.map((ingredient) => ingredient.name).join(", ")}. Found by {item.source}.
                        {owned ? " Already in your cabinet." : ""}
                      </span>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button type="button" className="btn" disabled={checkedCount === 0} onClick={addAll}>
              Add {checkedCount} to my cabinet
            </button>
            {mode !== "barcodes" && (
              <button type="button" className="btn btn-quiet" onClick={() => setMode("barcodes")}>
                Scan barcodes too
              </button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted">{SHELF_TEST}</p>
        </>
      )}
    </section>
  );
}
