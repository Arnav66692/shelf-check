import { distanceKm, SEARCH_RADIUS_KM, type CareCenter, type Emergency, type Place, type PlaceKind } from "@/components/care/places";

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const OVERPASS_URLS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  "https://lz4.overpass-api.de/api/interpreter",
] as const;
const USER_AGENT = "ShelfCheck/1.0 (medicine safety app)";
const NOMINATIM_TIMEOUT_MS = 8_000;
const OVERPASS_BUDGET_MS = 55_000;
const OVERPASS_STAGGER_MS = 8_000;
const NOMINATIM_GAP_MS = 1_100;
const CACHE_TTL_MS = 10 * 60 * 1000;
const CACHE_MAX_ENTRIES = 200;
const MAX_QUERY_LENGTH = 100;
const MAX_PLACES = 150;
const COORD_DECIMALS = 3;
const QUERY_TEXT = /^[\p{L}\p{N} ,.'#\-]+$/u;

type Entry<T> = { readonly at: number; readonly value: T };

const geocodeCache = new Map<string, Entry<CareCenter | null>>();
const placesCache = new Map<string, Entry<readonly Place[]>>();
let nextNominatimAt = 0;

function fromCache<T>(cache: Map<string, Entry<T>>, key: string): T | undefined {
  const entry = cache.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.at > CACHE_TTL_MS) {
    cache.delete(key);
    return undefined;
  }
  return entry.value;
}

function toCache<T>(cache: Map<string, Entry<T>>, key: string, value: T): void {
  if (cache.size >= CACHE_MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(key, { at: Date.now(), value });
}

class LookupError extends Error {}

// Nominatim allows one request per second for the whole app, so requests wait their turn.
async function waitForNominatimTurn(): Promise<void> {
  const now = Date.now();
  const startAt = Math.max(now, nextNominatimAt);
  nextNominatimAt = startAt + NOMINATIM_GAP_MS;
  if (startAt > now) await new Promise((resolve) => setTimeout(resolve, startAt - now));
}

async function geocode(query: string): Promise<CareCenter | null> {
  const key = query.toLowerCase();
  const cached = fromCache(geocodeCache, key);
  if (cached !== undefined) return cached;
  await waitForNominatimTurn();
  const url = `${NOMINATIM_URL}?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(query)}`;
  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(NOMINATIM_TIMEOUT_MS),
    });
  } catch {
    throw new LookupError("The place search did not answer in time. Try again in a moment.");
  }
  if (!response.ok) throw new LookupError("The place search is busy right now. Try again in a moment.");
  const rows: unknown = await response.json();
  const first = Array.isArray(rows) ? rows[0] : undefined;
  const lat = Number(first?.lat);
  const lon = Number(first?.lon);
  const center =
    Number.isFinite(lat) && Number.isFinite(lon)
      ? { lat, lon, label: typeof first?.display_name === "string" ? first.display_name : query }
      : null;
  toCache(geocodeCache, key, center);
  return center;
}

type OsmElement = {
  readonly type: string;
  readonly id: number;
  readonly lat?: number;
  readonly lon?: number;
  readonly center?: { readonly lat: number; readonly lon: number };
  readonly tags?: Readonly<Record<string, string>>;
};

function overpassQuery(lat: number, lon: number): string {
  const around = `(around:${SEARCH_RADIUS_KM * 1000},${lat},${lon})`;
  return `[out:json][timeout:20];
(
  nwr["amenity"~"^(pharmacy|hospital|clinic)$"]${around};
  nwr["healthcare"="urgent_care"]${around};
);
out center tags;`;
}

function kindOf(tags: Readonly<Record<string, string>>): PlaceKind {
  if (tags.amenity === "pharmacy" || tags.healthcare === "pharmacy") return "pharmacy";
  if (tags.amenity === "hospital" || tags.healthcare === "hospital") return "hospital";
  const name = (tags.name ?? "").toLowerCase();
  if (tags.healthcare === "urgent_care" || tags.urgent_care === "yes" || name.includes("urgent care")) return "urgent_care";
  return "clinic";
}

function emergencyOf(tags: Readonly<Record<string, string>>): Emergency {
  if (tags.emergency === "yes") return "yes";
  if (tags.emergency === "no") return "no";
  return "unknown";
}

function safeWebsite(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function addressOf(tags: Readonly<Record<string, string>>): string | undefined {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  const city = [tags["addr:city"], tags["addr:state"]].filter(Boolean).join(", ");
  const line = [street, city, tags["addr:postcode"]].filter(Boolean).join(", ");
  return line || tags["addr:full"] || undefined;
}

function firstValue(raw: string | undefined): string | undefined {
  return raw?.split(";")[0]?.trim() || undefined;
}

function toPlace(element: OsmElement, origin: { lat: number; lon: number }): Place | null {
  const tags = element.tags ?? {};
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;
  if (lat === undefined || lon === undefined) return null;
  const kind = kindOf(tags);
  return {
    id: `${element.type}/${element.id}`,
    name: tags.name ?? tags.brand ?? `Unnamed ${kind === "urgent_care" ? "urgent care" : kind}`,
    kind,
    emergency: kind === "hospital" ? emergencyOf(tags) : "unknown",
    lat,
    lon,
    phone: firstValue(tags.phone ?? tags["contact:phone"]),
    openingHours: tags.opening_hours,
    website: safeWebsite(firstValue(tags.website ?? tags["contact:website"])),
    address: addressOf(tags),
    distanceKm: distanceKm(origin.lat, origin.lon, lat, lon),
  };
}

async function askOverpass(url: string, query: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "User-Agent": USER_AGENT, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: `data=${encodeURIComponent(query)}`,
    signal,
  });
  if (!response.ok) throw new Error(`Overpass answered ${response.status}`);
  return response.json();
}

// Public Overpass servers are often slow or full. Ask one, bring in the next after a short wait or a failure, keep the first answer.
async function fetchOverpass(query: string): Promise<unknown> {
  const deadline = AbortSignal.timeout(OVERPASS_BUDGET_MS);
  const controllers = OVERPASS_URLS.map(() => new AbortController());
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await new Promise<unknown>((resolve, reject) => {
      let started = 0;
      let failed = 0;
      const startNext = () => {
        clearTimeout(timer);
        if (started >= OVERPASS_URLS.length) return;
        const index = started++;
        askOverpass(OVERPASS_URLS[index], query, AbortSignal.any([controllers[index].signal, deadline])).then(resolve, () => {
          failed++;
          if (deadline.aborted) reject(new LookupError("The map data service did not answer in time. Try again in a moment."));
          else if (failed === OVERPASS_URLS.length) reject(new LookupError("The map data service is busy right now. Try again in a moment."));
          else startNext();
        });
        timer = setTimeout(startNext, OVERPASS_STAGGER_MS);
      };
      startNext();
    });
  } finally {
    clearTimeout(timer);
    for (const controller of controllers) controller.abort();
  }
}

async function nearbyPlaces(lat: number, lon: number): Promise<readonly Place[]> {
  const key = `${lat.toFixed(COORD_DECIMALS)},${lon.toFixed(COORD_DECIMALS)}`;
  const cached = fromCache(placesCache, key);
  if (cached) return cached;
  const body = await fetchOverpass(overpassQuery(lat, lon));
  const elements = typeof body === "object" && body !== null ? (body as { elements?: unknown }).elements : undefined;
  if (!Array.isArray(elements)) throw new LookupError("The map data service sent something we could not read. Try again.");
  const origin = { lat, lon };
  const places = (elements as OsmElement[])
    .map((element) => toPlace(element, origin))
    .filter((place): place is Place => place !== null && place.distanceKm <= SEARCH_RADIUS_KM)
    .toSorted((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, MAX_PLACES);
  toCache(placesCache, key, places);
  return places;
}

function badRequest(error: string): Response {
  return Response.json({ error }, { status: 400 });
}

function isCoordinate(value: unknown, limit: number): value is number {
  return typeof value === "number" && Number.isFinite(value) && Math.abs(value) <= limit;
}

async function resolveCenter(body: Record<string, unknown>): Promise<CareCenter | Response> {
  if (typeof body.query === "string") {
    const query = body.query.trim();
    if (query === "" || query.length > MAX_QUERY_LENGTH || !QUERY_TEXT.test(query)) {
      return badRequest("Type a ZIP code or a city name, like 92130 or San Diego.");
    }
    const center = await geocode(query);
    return center ?? Response.json({ error: `We could not find ${query}. Try a ZIP code.` }, { status: 404 });
  }
  if (isCoordinate(body.lat, 90) && isCoordinate(body.lon, 180)) {
    return { lat: body.lat, lon: body.lon, label: "Your location" };
  }
  return badRequest("Send a ZIP code, a city, or a location.");
}

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return badRequest("Send a ZIP code, a city, or a location.");
  }
  if (typeof body !== "object" || body === null) return badRequest("Send a ZIP code, a city, or a location.");
  try {
    const center = await resolveCenter(body as Record<string, unknown>);
    if (center instanceof Response) return center;
    const places = await nearbyPlaces(center.lat, center.lon);
    return Response.json({ center, places }, { headers: { "Cache-Control": "no-store" } });
  } catch (caught) {
    if (caught instanceof LookupError) return Response.json({ error: caught.message }, { status: 502 });
    return Response.json({ error: "Something went wrong looking up places. Try again." }, { status: 500 });
  }
}
