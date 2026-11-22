"use client";

import { useEffect, useRef, useState } from "react";
import { MATCHER_TEST } from "@/lib/matcherScore";

export type PhotoMatch = {
  readonly setId: string;
  readonly name: string;
  readonly ndc: string;
  readonly actives: readonly string[];
  readonly score: number;
};

type Stage = "model" | "read" | "compare" | "done" | "error";

type WorkerMessage =
  | { type: "progress"; id?: number; stage: "model"; loaded: number; total: number; cached?: boolean }
  | { type: "progress"; id?: number; stage: "read" }
  | { type: "progress"; id?: number; stage: "compare"; products: number }
  | { type: "done"; id: number; matches: PhotoMatch[]; backend: string; modelMs: number; totalMs: number }
  | { type: "error"; id: number; message: string };

const STEPS: readonly { stage: Exclude<Stage, "done" | "error">; label: string }[] = [
  { stage: "model", label: "Waking Zephyr" },
  { stage: "read", label: "Zephyr is reading the photo" },
  { stage: "compare", label: "Comparing official labels" },
];

let sharedWorker: Worker | null = null;
let nextId = 0;

function worker(): Worker {
  if (!sharedWorker) sharedWorker = new Worker("/matcher/worker.js?v=4");
  return sharedWorker;
}

function titleCase(text: string): string {
  return text.toLowerCase().replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function megabytes(bytes: number): string {
  return (bytes / 1_000_000).toFixed(1);
}

function StepRow({ index, label, state, detail }: { index: number; label: string; state: "wait" | "now" | "done"; detail?: string }) {
  return (
    <li className={`flex items-center gap-4 py-2.5 border-b border-[var(--hair)] transition-colors duration-500 ${state === "wait" ? "text-muted" : "text-ink"}`}>
      <span className={`font-[family-name:var(--font-display)] text-[13px] font-medium tracking-[0.15em] ${state === "now" ? "text-accent blink" : state === "done" ? "text-accent" : ""}`}>
        {String(index + 1).padStart(2, "0")}
      </span>
      <span className="label !text-inherit flex-1">{label}</span>
      <span className="label !text-inherit tabular-nums">{state === "done" ? "Done" : state === "now" ? detail ?? "" : ""}</span>
    </li>
  );
}

export function PhotoMatcher({ file, onPick, onClose }: { file: File; onPick: (match: PhotoMatch) => void; onClose: () => void }) {
  const [stage, setStage] = useState<Stage>("model");
  const [download, setDownload] = useState<{ loaded: number; total: number; cached: boolean } | null>(null);
  const [matches, setMatches] = useState<PhotoMatch[]>([]);
  const [timing, setTiming] = useState<{ backend: string; modelMs: number; totalMs: number } | null>(null);
  const [preview, setPreview] = useState("");
  const runId = useRef(0);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const id = ++nextId;
    runId.current = id;
    setStage("model");
    setMatches([]);
    setTiming(null);
    const target = worker();
    function onMessage(event: MessageEvent<WorkerMessage>) {
      const data = event.data;
      if (data.id !== undefined && data.id !== runId.current) return;
      if (data.type === "progress" && data.stage === "model") {
        setDownload({ loaded: data.loaded, total: data.total, cached: Boolean(data.cached) });
      } else if (data.type === "progress") {
        setStage(data.stage);
      } else if (data.type === "done") {
        setMatches(data.matches);
        setTiming({ backend: data.backend, modelMs: data.modelMs, totalMs: data.totalMs });
        setStage("done");
      } else if (data.type === "error") {
        setStage("error");
      }
    }
    target.addEventListener("message", onMessage);
    target.postMessage({ id, blob: file });
    return () => target.removeEventListener("message", onMessage);
  }, [file]);

  const order = STEPS.map((step) => step.stage);
  const current = stage === "done" ? order.length : order.indexOf(stage as (typeof order)[number]);
  const modelDetail = download
    ? download.cached
      ? "Saved on this device"
      : download.total
        ? `${megabytes(download.loaded)} of ${megabytes(download.total)} MB`
        : `${megabytes(download.loaded)} MB`
    : "Starting";
  const top = matches[0]?.score ?? 1;

  return (
    <div className="facts mt-4 grid gap-5 md:grid-cols-[220px_minmax(0,1fr)]">
      <div className="relative aspect-square overflow-hidden border border-[var(--hair)] bg-black">
        {preview && <img src={preview} alt="Your photo" className="h-full w-full object-cover opacity-80" />}
        <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(var(--grid)_1px,transparent_1px),linear-gradient(90deg,var(--grid)_1px,transparent_1px)] bg-[size:28px_28px]" />
        {stage !== "done" && stage !== "error" && <div aria-hidden="true" className="scanline" />}
        <span aria-hidden="true" className="absolute left-2 top-2 h-4 w-4 border-l border-t border-[var(--accent)]" />
        <span aria-hidden="true" className="absolute right-2 top-2 h-4 w-4 border-r border-t border-[var(--accent)]" />
        <span aria-hidden="true" className="absolute left-2 bottom-2 h-4 w-4 border-l border-b border-[var(--accent)]" />
        <span aria-hidden="true" className="absolute right-2 bottom-2 h-4 w-4 border-r border-b border-[var(--accent)]" />
      </div>

      <div className="min-w-0">
        <div className="flex items-center justify-between gap-3">
          <p className="label hud-bar">Zephyr photo match</p>
          <button type="button" className="label underline" onClick={onClose}>
            Close
          </button>
        </div>

        {stage !== "done" && stage !== "error" && (
          <div role="status" aria-live="polite">
            <ol className="mt-3">
              {STEPS.map((step, index) => (
                <StepRow
                  key={step.stage}
                  index={index}
                  label={step.label}
                  state={index < current ? "done" : index === current ? "now" : "wait"}
                  detail={step.stage === "model" ? modelDetail : step.stage === "compare" ? "3,588 products" : "336 px"}
                />
              ))}
            </ol>
            <div className="mt-4 h-px w-full bg-[var(--hair)] overflow-hidden" aria-hidden="true">
              <div
                className="h-px bg-[var(--accent)] transition-[width] duration-300"
                style={{ width: `${stage === "model" && download?.total ? Math.round((download.loaded / download.total) * 60) : stage === "model" ? 10 : stage === "read" ? 75 : 92}%` }}
              />
            </div>
          </div>
        )}

        {stage === "error" && (
          <p className="mt-3" role="alert">
            Zephyr could not run in this browser. Search by name or scan the barcode instead.
          </p>
        )}

        {stage === "done" && (
          <div className="rise">
            <p className="mt-3 text-sm text-ink-soft">
              Zephyr found the 5 closest official labels. Pick yours, then check it against the bottle. This only suggests, it never adds anything by itself.
            </p>
            <ol className="mt-3 grid gap-2">
              {matches.map((match, index) => (
                <li key={match.setId}>
                  <button
                    type="button"
                    onClick={() => onPick(match)}
                    className="group w-full text-left grid grid-cols-[28px_minmax(0,1fr)] gap-3 py-3 row-item"
                  >
                    <span className={`font-[family-name:var(--font-display)] text-[13px] font-medium tracking-[0.15em] ${index === 0 ? "text-accent" : "text-muted"}`}>
                      {String(index + 1).padStart(2, "0")}
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold truncate">{titleCase(match.name)}</span>
                      <span className="block text-sm text-ink-soft truncate">{match.actives.join(", ") || "Ingredients on the label"}</span>
                      <span className="mt-1.5 block h-px bg-[var(--hair)]" aria-hidden="true">
                        <span className="block h-px bg-[var(--accent)]" style={{ width: `${Math.max(8, Math.round((match.score / top) * 100))}%` }} />
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ol>
            <p className="mt-3 text-xs text-muted">
              {timing && `Ran on this device in ${(timing.modelMs / 1000).toFixed(2)} s with ${timing.backend === "webgpu" ? "the graphics chip" : "the processor"}. Your photo is not uploaded. `}
              {MATCHER_TEST}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
