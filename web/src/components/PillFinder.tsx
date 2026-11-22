"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import {
  imprintSides,
  PILL_GUESS_NOTICE,
  type PillKind,
  type PillMatch,
  type PillRecord,
  type PillSourceId,
} from "@engine/pills.ts";

export interface PillSourceSummary {
  readonly id: PillSourceId;
  readonly name: string;
  readonly snapshotDate: string;
  readonly records: number;
}

export interface PillOptionsResponse {
  readonly colors: readonly string[];
  readonly shapes: readonly string[];
  readonly sources: readonly PillSourceSummary[];
}

export interface PillResult {
  readonly score: number;
  readonly match: PillMatch;
  readonly reason: string;
  readonly product: PillRecord;
  readonly sameLook: { readonly total: number; readonly shown: readonly PillRecord[] };
}

export interface PillSearchResponse {
  readonly notice: string;
  readonly candidates: readonly PillResult[];
  readonly sources: readonly PillSourceSummary[];
}

export interface PillImage {
  readonly name: string;
  readonly url: string;
  readonly isPillPicture: boolean;
}

export interface PillImagesResponse {
  readonly images: readonly PillImage[];
}

type Search =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "done"; result: PillSearchResponse; imprintEntered: boolean }
  | { status: "failed"; message: string };

const LOAD_FAILED = "The pill list could not load. Try again in a moment.";
const POISON_HELP =
  "If someone may have swallowed a pill that is not theirs, call Poison Help at 1-800-222-1222 now. If they collapse, have a seizure or cannot breathe, call 911.";
const GUESS_LINE = "This is an educated guess from the imprint, colour and shape. A pharmacist can confirm it.";
const COUNTERFEIT_LINE =
  "Fake pills that look like this are common and can contain fentanyl. If this pill did not come from a pharmacy, do not take it. Call Poison Help, 1-800-222-1222. If someone took it and is very sleepy or breathing slowly, call 911.";
const CONTROLLED_NAMES =
  /\b(oxycodone|hydrocodone|oxymorphone|hydromorphone|morphine|fentanyl|codeine|tramadol|tapentadol|methadone|buprenorphine|meperidine|levorphanol|percocet|vicodin|norco|roxicodone|oxycontin|dilaudid|opana|alprazolam|xanax|clonazepam|klonopin|diazepam|valium|lorazepam|ativan|temazepam|triazolam|chlordiazepoxide|clorazepate|oxazepam|estazolam|flurazepam|midazolam|clobazam|amphetamine|dextroamphetamine|methamphetamine|lisdexamfetamine|adderall|vyvanse|desoxyn|methylphenidate|dexmethylphenidate|ritalin|concerta|focalin|phentermine)\b/i;
const NO_IMPRINT_REASON = "Matched on colour and shape only, because no imprint was typed.";
const MATCH_LABEL: Record<PillMatch, string> = {
  exact_imprint: "Imprint matches",
  close_imprint: "Close imprint",
  colour_and_shape: "Colour and shape only",
};
const KIND_LABEL: Record<PillKind, string> = {
  prescription: "Prescription medicine",
  otc: "Over the counter medicine",
  homeopathic: "Homeopathic product",
  animal: "Animal medicine, not for people",
  other: "Other product",
};
const SOURCE_LABEL: Record<PillSourceId, string> = {
  dailymed: "DailyMed label",
  pillbox: "NLM Pillbox archive, frozen in 2020",
};

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url);
  const body = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || body === null) throw new Error(body?.error ?? LOAD_FAILED);
  return body;
}

const imageRequests = new Map<string, Promise<PillImagesResponse>>();

function labelImages(setId: string, pillImage: string | undefined): Promise<PillImagesResponse> {
  const url = `/api/pills?images=${encodeURIComponent(setId)}${pillImage ? `&name=${encodeURIComponent(pillImage)}` : ""}`;
  const cached = imageRequests.get(url);
  if (cached) return cached;
  const pending = getJson<PillImagesResponse>(url);
  pending.catch(() => imageRequests.delete(url));
  imageRequests.set(url, pending);
  return pending;
}

function lower(text: string): string {
  return text.toLowerCase();
}

function colourText(record: PillRecord): string {
  return record.colors.length === 0 ? "Not listed" : record.colors.map(lower).join(" and ");
}

function Picture({ src, alt, caption }: { src: string; alt: string; caption: string }) {
  return (
    <figure className="mb-3">
      {/* eslint-disable-next-line @next/next/no-img-element -- pill pictures come from NLM servers at unknown sizes */}
      <img src={src} alt={alt} loading="lazy" className="block w-full max-w-[280px] border border-[var(--rule)] bg-white" />
      <figcaption className="mt-1 text-sm text-ink-soft">{caption}</figcaption>
    </figure>
  );
}

function LabelPicture({ record }: { record: PillRecord }) {
  const key = `${record.setId}|${record.splImage ?? ""}`;
  const [settled, setSettled] = useState<{ key: string; image: PillImage | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    labelImages(record.setId, record.splImage)
      .then((result) => {
        if (cancelled) return;
        const image = result.images.find((item) => item.isPillPicture) ?? result.images[0] ?? null;
        setSettled({ key, image });
      })
      .catch(() => !cancelled && setSettled({ key, image: null }));
    return () => {
      cancelled = true;
    };
  }, [key, record.setId, record.splImage]);

  const current = settled?.key === key ? settled : null;
  if (current === null) return <p className="mb-3 text-sm text-ink-soft">Looking for a picture on DailyMed.</p>;
  if (current.image === null) return <p className="mb-3 text-sm text-ink-soft">No picture on file for this product.</p>;
  return (
    <Picture
      src={current.image.url}
      alt={`Picture from the label for ${record.name}`}
      caption={
        current.image.isPillPicture
          ? "Picture of the pill from the DailyMed label."
          : "Picture from the DailyMed label. It may show the package, not the pill."
      }
    />
  );
}

function PillPicture({ result }: { result: PillResult }) {
  const withPhoto = [result.product, ...result.sameLook.shown].find((record) => record.pillboxImage !== undefined);
  if (withPhoto?.pillboxImage !== undefined) {
    return (
      <Picture
        src={`/api/pills?pillboxImage=${encodeURIComponent(withPhoto.pillboxImage)}`}
        alt={`Photo of ${withPhoto.name}, imprint ${imprintSides(withPhoto.imprint).join(" ")}`}
        caption={`Photo from the NLM Pillbox archive, product code ${withPhoto.ndc}.`}
      />
    );
  }
  return <LabelPicture record={result.product} />;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="facts-row">
      <span>{label}</span>
      <span className="font-bold text-right">{value}</span>
    </div>
  );
}

function SameLook({ result }: { result: PillResult }) {
  const { total, shown } = result.sameLook;
  if (total === 0) return null;
  return (
    <details className="mt-3">
      <summary className="cursor-pointer underline font-bold">
        {result.product.strength.trim() === "" ? "Same look, strength not listed," : "Same look and strength"} under {total} other
        product {total === 1 ? "code" : "codes"}
      </summary>
      <ul className="mt-2">
        {shown.map((record) => (
          <li key={`${record.ndc}-${record.part}`} className="facts-row text-sm">
            <span>
              <span className="font-bold">{record.name}</span>, {record.maker}
            </span>
            <span className="text-right">
              {record.ndc}, {record.source === "dailymed" ? "DailyMed" : "Pillbox"} {record.date}
            </span>
          </li>
        ))}
      </ul>
      {total > shown.length && <p className="mt-1 text-sm text-ink-soft">Showing {shown.length} of {total}.</p>}
    </details>
  );
}

function isCommonlyFaked(record: PillRecord): boolean {
  return CONTROLLED_NAMES.test(`${record.name} ${record.strength}`);
}

function CounterfeitWarning() {
  return (
    <div className="facts" role="alert" style={{ borderColor: "var(--stop)" }}>
      <span className="px-2.5 py-1 font-[family-name:var(--font-display)] text-[12px] font-medium uppercase tracking-[0.15em] bg-[var(--stop)] text-[var(--on-accent)]">
        Stop
      </span>
      <p className="mt-2 text-lg font-bold">{COUNTERFEIT_LINE}</p>
      <p className="mt-1 text-sm text-ink-soft">
        At least one guess below is an opioid, a benzodiazepine or a stimulant. The DEA warns that fake pills made to
        look like these often contain fentanyl.{" "}
        <a className="underline" href="https://www.dea.gov/onepill" target="_blank" rel="noopener noreferrer">
          DEA One Pill Can Kill
        </a>
        .
      </p>
    </div>
  );
}

function withoutImprintClaim(reason: string): string {
  const rest = reason.replace(/^Imprint [^.]*\.\s*/, "").replace(/^Matched on colour and shape only[^.]*\.\s*/, "");
  return rest === "" ? NO_IMPRINT_REASON : `${NO_IMPRINT_REASON} ${rest}`;
}

function ResultPanel({ result, rank, imprintEntered }: { result: PillResult; rank: number; imprintEntered: boolean }) {
  const { product } = result;
  const match: PillMatch = imprintEntered ? result.match : "colour_and_shape";
  const reason = imprintEntered ? result.reason : withoutImprintClaim(result.reason);
  const sides = imprintSides(product.imprint);
  const ingredients = product.strength.split(";").map((line) => line.trim()).filter((line) => line !== "");
  return (
    <article className="facts">
      <p className="text-sm font-bold uppercase tracking-wide">
        Guess {rank}, {MATCH_LABEL[match]}
      </p>
      <h2 className="facts-title">{product.name}</h2>
      <PillPicture result={result} />
      <div className="facts-head">Strength</div>
      {ingredients.length === 0 ? (
        <div className="facts-row">No strength on record.</div>
      ) : (
        ingredients.map((line) => (
          <div key={line} className="facts-row">
            <span>{line}</span>
          </div>
        ))
      )}
      <div className="facts-head mt-3">Product</div>
      <Row label="Maker" value={product.maker} />
      <Row label="Product code (NDC)" value={product.part > 0 ? `${product.ndc}, kit part ${product.part}` : product.ndc} />
      <Row label="Type" value={KIND_LABEL[product.kind]} />
      <Row label="Imprint, by side" value={sides.length === 0 ? "None listed" : sides.join(", ")} />
      <Row label="Colour" value={colourText(product)} />
      <Row label="Shape" value={product.shape === "" ? "Not listed" : lower(product.shape)} />
      {product.sizeMm !== undefined && <Row label="Size" value={`${product.sizeMm} mm`} />}
      <Row label="Source" value={`${SOURCE_LABEL[product.source]}, dated ${product.date}`} />
      <p className="mt-3">{reason}</p>
      <p className="mt-1 text-sm text-ink-soft">{PILL_GUESS_NOTICE}</p>
      <a
        className="mt-2 inline-block underline font-bold"
        href={`https://dailymed.nlm.nih.gov/dailymed/drugInfo.cfm?setid=${encodeURIComponent(product.setId)}`}
        target="_blank"
        rel="noopener noreferrer"
      >
        Label on DailyMed
      </a>
      <SameLook result={result} />
    </article>
  );
}

function SourceNote({ sources }: { sources: readonly PillSourceSummary[] }) {
  return (
    <p className="text-sm text-ink-soft">
      Searched{" "}
      {sources
        .map((source) => `${source.records.toLocaleString("en-US")} records from ${source.name}, dated up to ${source.snapshotDate}`)
        .join(", and ")}
      . Older records can be out of date, and a pill that is not listed can still exist.
    </p>
  );
}

function Results({ search }: { search: Search }) {
  if (search.status === "idle") return null;
  if (search.status === "loading") return <p className="text-ink-soft">Searching the pill list.</p>;
  if (search.status === "failed") return <p role="alert">{search.message}</p>;
  const { candidates, sources } = search.result;
  const faked = candidates.some((result) => isCommonlyFaked(result.product));
  return (
    <>
      <p className="font-bold">{POISON_HELP}</p>
      {faked && <CounterfeitWarning />}
      <p className="font-bold">
        {candidates.length === 0
          ? "No pill in the list matches. Check the imprint, or try without colour and shape."
          : `${candidates.length} ${candidates.length === 1 ? "guess" : "guesses"}, most likely first.`}
      </p>
      <SourceNote sources={sources} />
      {candidates.map((result, index) => (
        <ResultPanel
          key={`${result.product.ndc}-${result.product.part}`}
          result={result}
          rank={index + 1}
          imprintEntered={search.imprintEntered}
        />
      ))}
    </>
  );
}

export function PillFinder() {
  const [options, setOptions] = useState<PillOptionsResponse | null>(null);
  const [optionsError, setOptionsError] = useState<string | null>(null);
  const [imprint, setImprint] = useState("");
  const [color, setColor] = useState("");
  const [shape, setShape] = useState("");
  const [search, setSearch] = useState<Search>({ status: "idle" });
  const latest = useRef(0);

  useEffect(() => {
    let cancelled = false;
    getJson<PillOptionsResponse>("/api/pills?options=1")
      .then((result) => !cancelled && setOptions(result))
      .catch((error: unknown) => !cancelled && setOptionsError(error instanceof Error ? error.message : LOAD_FAILED));
    return () => {
      cancelled = true;
    };
  }, []);

  async function find(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (imprint.replace(/[^a-z0-9]/gi, "").length < 2 && !(color && shape)) {
      setSearch({ status: "failed", message: "Type the letters or numbers stamped on the pill, or pick both a colour and a shape." });
      return;
    }
    const request = latest.current + 1;
    latest.current = request;
    setSearch({ status: "loading" });
    const params = new URLSearchParams({ imprint, color, shape });
    const imprintEntered = imprint.replace(/[^a-z0-9]/gi, "").length > 0;
    try {
      const result = await getJson<PillSearchResponse>(`/api/pills?${params.toString()}`);
      if (latest.current === request) setSearch({ status: "done", result, imprintEntered });
    } catch (error) {
      if (latest.current === request) setSearch({ status: "failed", message: error instanceof Error ? error.message : LOAD_FAILED });
    }
  }

  return (
    <div className="pt-6">
      <h1 className="text-3xl font-medium narrow">Pill finder</h1>
      <div className="mt-4 facts max-w-[900px]" role="note">
        <p className="font-bold text-lg">{POISON_HELP}</p>
      </div>
      <p className="mt-3 max-w-[900px]">{GUESS_LINE}</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <form className="grid gap-4 content-start" onSubmit={find}>
          <label className="grid gap-1 font-bold">
            Letters and numbers stamped on the pill
            <input
              className="field font-normal"
              value={imprint}
              maxLength={40}
              autoComplete="off"
              autoCapitalize="characters"
              placeholder="For example M 367"
              onChange={(event) => setImprint(event.target.value)}
            />
          </label>
          <label className="grid gap-1 font-bold">
            Colour
            <select className="field font-normal" value={color} onChange={(event) => setColor(event.target.value)}>
              <option value="">Any colour</option>
              {options?.colors.map((value) => (
                <option key={value} value={value}>
                  {lower(value)}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 font-bold">
            Shape
            <select className="field font-normal" value={shape} onChange={(event) => setShape(event.target.value)}>
              <option value="">Any shape</option>
              {options?.shapes.map((value) => (
                <option key={value} value={value}>
                  {lower(value)}
                </option>
              ))}
            </select>
          </label>
          <p className="text-sm text-ink-soft">Type at least two characters, or pick both a colour and a shape.</p>
          {optionsError && <p role="alert">{optionsError}</p>}
          <button className="btn" type="submit" disabled={search.status === "loading"}>
            Find the pill
          </button>
        </form>

        <section aria-live="polite" aria-busy={search.status === "loading"} className="grid gap-4 content-start">
          <Results search={search} />
        </section>
      </div>
    </div>
  );
}
