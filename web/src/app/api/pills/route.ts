import { readFile } from "node:fs/promises";
import path from "node:path";
import { inflateRawSync } from "node:zlib";
import type { NextRequest } from "next/server";
import {
  findPills,
  parsePillFile,
  pillColors,
  pillShapes,
  PILL_GUESS_NOTICE,
  type PillCandidate,
  type PillFile,
  type PillboxImageEntry,
} from "@engine/pills.ts";
import type { PillImagesResponse, PillOptionsResponse, PillSearchResponse } from "@/components/PillFinder";

const PILL_FILE = path.join(process.cwd(), "..", "engine", "data", "pills.json");
const DAILYMED_MEDIA = "https://dailymed.nlm.nih.gov/dailymed/services/v2/spls";
const DAILYMED_ORIGIN = "https://dailymed.nlm.nih.gov/";
const USER_AGENT = "Mozilla/5.0 (compatible; pill-finder/1.0)";
const REMOTE_TIMEOUT_MS = 10_000;
const MAX_IMPRINT_LENGTH = 40;
const MAX_SAME_LOOK_SHOWN = 12;
const LOCAL_HEADER_LENGTH = 30;
const LOCAL_HEADER_SLACK = 1024;
const LOCAL_SIGNATURE = 0x04034b50;
const DEFLATED = 8;
const SET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const IMPRINT_TEXT = /^[\p{L}\p{N} ;,.\-/]*$/u;
const IMAGE_FILE = /^[\w .-]{1,120}\.(jpe?g|png|gif)$/i;

interface LoadedPills {
  readonly file: PillFile;
  readonly colors: readonly string[];
  readonly shapes: readonly string[];
}

let loaded: Promise<LoadedPills> | undefined;

function loadPills(): Promise<LoadedPills> {
  loaded ??= readFile(PILL_FILE, "utf8").then((text) => {
    const file = parsePillFile(JSON.parse(text));
    return { file, colors: pillColors(file.records), shapes: pillShapes(file.records) };
  });
  loaded.catch(() => {
    loaded = undefined;
  });
  return loaded;
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

function sourceList(file: PillFile): PillOptionsResponse["sources"] {
  return file.sources.map((source) => ({ id: source.id, name: source.name, snapshotDate: source.snapshotDate, records: source.records }));
}

function toResult(candidate: PillCandidate): PillSearchResponse["candidates"][number] {
  return {
    score: candidate.score,
    match: candidate.match,
    reason: candidate.reason,
    product: candidate.product,
    sameLook: { total: candidate.sameLook.length, shown: candidate.sameLook.slice(0, MAX_SAME_LOOK_SHOWN) },
  };
}

function pickOption(value: string | null, allowed: readonly string[], label: string): { value?: string; error?: string } {
  const wanted = value?.trim().toUpperCase() ?? "";
  if (wanted === "") return {};
  return allowed.includes(wanted) ? { value: wanted } : { error: `That ${label} is not in the pill list.` };
}

async function search(params: URLSearchParams): Promise<Response> {
  const imprint = params.get("imprint") ?? "";
  if (imprint.length > MAX_IMPRINT_LENGTH || !IMPRINT_TEXT.test(imprint)) {
    return badRequest("Type the letters and numbers stamped on the pill, up to 40 characters.");
  }
  const pills = await loadPills();
  const color = pickOption(params.get("color"), pills.colors, "colour");
  const shape = pickOption(params.get("shape"), pills.shapes, "shape");
  const error = color.error ?? shape.error;
  if (error !== undefined) return badRequest(error);
  const candidates = findPills(
    { imprint, ...(color.value ? { color: color.value } : {}), ...(shape.value ? { shape: shape.value } : {}) },
    pills.file.records,
  );
  const body: PillSearchResponse = {
    notice: PILL_GUESS_NOTICE,
    candidates: candidates.map(toResult),
    sources: sourceList(pills.file),
  };
  return Response.json(body);
}

function mediaList(raw: unknown): readonly { readonly name: string; readonly url: string }[] {
  if (typeof raw !== "object" || raw === null) return [];
  const data = (raw as { data?: { media?: unknown } }).data;
  if (!Array.isArray(data?.media)) return [];
  return data.media.flatMap((item: unknown) => {
    const { name, url, mime_type: mimeType } = (item ?? {}) as { name?: unknown; url?: unknown; mime_type?: unknown };
    const usable =
      typeof name === "string" &&
      typeof url === "string" &&
      url.startsWith(DAILYMED_ORIGIN) &&
      typeof mimeType === "string" &&
      mimeType.startsWith("image/");
    return usable ? [{ name, url }] : [];
  });
}

async function dailyMedImages(setId: string, pillImage: string | null): Promise<Response> {
  if (!SET_ID.test(setId)) return badRequest("That label id is not valid.");
  if (pillImage !== null && !IMAGE_FILE.test(pillImage)) return badRequest("That picture name is not valid.");
  const response = await fetch(`${DAILYMED_MEDIA}/${setId}/media.json`, {
    headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  if (!response.ok) {
    console.error("DailyMed media lookup failed", setId, response.status);
    return Response.json({ error: "DailyMed did not answer. The picture is missing for now." }, { status: 502 });
  }
  const media = mediaList(await response.json());
  const body: PillImagesResponse = {
    images: media.map((item) => ({ ...item, isPillPicture: pillImage !== null && item.name === pillImage })),
  };
  return Response.json(body, { headers: { "Cache-Control": "public, max-age=86400" } });
}

function entryBytes(zipped: Uint8Array, entry: PillboxImageEntry): Buffer {
  const view = Buffer.from(zipped);
  if (view.length < LOCAL_HEADER_LENGTH || view.readUInt32LE(0) !== LOCAL_SIGNATURE) throw new Error("no local zip header");
  const start = LOCAL_HEADER_LENGTH + view.readUInt16LE(26) + view.readUInt16LE(28);
  const data = view.subarray(start, start + entry.compressedSize);
  if (data.length !== entry.compressedSize) throw new Error("zip entry was cut short");
  return view.readUInt16LE(8) === DEFLATED ? inflateRawSync(data) : data;
}

async function pillboxImage(name: string): Promise<Response> {
  const { file } = await loadPills();
  const entry = file.pillboxImageZip.entries.get(name);
  if (entry === undefined) return badRequest("There is no Pillbox picture with that name.");
  const last = entry.offset + LOCAL_HEADER_LENGTH + LOCAL_HEADER_SLACK + entry.compressedSize - 1;
  const response = await fetch(file.pillboxImageZip.url, {
    headers: { "User-Agent": USER_AGENT, Range: `bytes=${entry.offset}-${last}` },
    signal: AbortSignal.timeout(REMOTE_TIMEOUT_MS),
  });
  if (response.status !== 206) {
    console.error("Pillbox picture range read failed", name, response.status);
    return Response.json({ error: "The Pillbox archive did not answer. The picture is missing for now." }, { status: 502 });
  }
  const jpeg = entryBytes(new Uint8Array(await response.arrayBuffer()), entry);
  return new Response(new Uint8Array(jpeg), {
    headers: { "Content-Type": "image/jpeg", "Cache-Control": "public, max-age=604800, immutable" },
  });
}

export async function GET(request: NextRequest): Promise<Response> {
  const params = request.nextUrl.searchParams;
  try {
    const setId = params.get("images");
    if (setId !== null) return await dailyMedImages(setId, params.get("name"));
    const image = params.get("pillboxImage");
    if (image !== null) return await pillboxImage(image);
    if (params.has("options")) {
      const pills = await loadPills();
      const body: PillOptionsResponse = { colors: pills.colors, shapes: pills.shapes, sources: sourceList(pills.file) };
      return Response.json(body);
    }
    return await search(params);
  } catch (error) {
    console.error("pill lookup failed", error);
    return Response.json({ error: "The pill list could not load. Try again in a moment." }, { status: 500 });
  }
}
