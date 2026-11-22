"use client";

import "./care.css";
import dynamic from "next/dynamic";
import { useMemo, useRef, useState, type FormEvent } from "react";
import { useCabinet } from "@/lib/store";
import { EmergencyNotice, FeelingPicker } from "./FeelingPicker";
import { PlaceList } from "./PlaceList";
import { placesFor, SEARCH_RADIUS_KM, type CareCenter, type CareRequest, type CareResponse, type Feeling, type Place } from "./places";

const CareMap = dynamic(() => import("./CareMap").then((module) => module.CareMap), {
  ssr: false,
  loading: () => <div className="care-map grid place-items-center label">Loading map</div>,
});

const GEO_TIMEOUT_MS = 15_000;
const RADIUS_MILES = Math.round(SEARCH_RADIUS_KM / 1.609344);

type Status =
  | { readonly kind: "idle" }
  | { readonly kind: "locating" }
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string };

type Found = { readonly center: CareCenter; readonly places: readonly Place[] };

function geoErrorMessage(error: GeolocationPositionError): string {
  if (error.code === error.PERMISSION_DENIED) return "Location is turned off for this site. Type a ZIP code or city instead.";
  return "We could not get your location. Type a ZIP code or city instead.";
}

function Legend() {
  const items = [
    ["pharmacy", "Pharmacy"],
    ["urgent_care", "Urgent care"],
    ["clinic", "Clinic"],
    ["emergency", "Hospital with emergency room"],
    ["hospital", "Other hospital"],
    ["you", "You"],
  ] as const;
  return (
    <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1" aria-label="Map key">
      {items.map(([kind, label]) => (
        <li key={kind} className="label flex items-center">
          <span className={`care-key care-marker care-marker--${kind}`} aria-hidden="true" />
          {label}
        </li>
      ))}
    </ul>
  );
}

function MedicinePicker({ medicine, onChange }: { medicine: string; onChange: (next: string) => void }) {
  const { items } = useCabinet();
  const names = [...new Set(items.map((item) => item.displayName))];
  return (
    <div className="facts grid gap-3">
      <h3 className="facts-head !pt-0">Medicine you need</h3>
      <p className="text-ink-soft">
        No public list shows which pharmacy has which medicine in stock. Pick one and each pharmacy shows a number to call.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        {names.length > 0 && (
          <label className="grid gap-1 font-bold">
            From your cabinet
            <select className="field font-normal" value={names.includes(medicine) ? medicine : ""} onChange={(event) => onChange(event.target.value)}>
              <option value="">Choose a medicine</option>
              {names.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="grid gap-1 font-bold">
          {names.length > 0 ? "Or type a name" : "Type a medicine name"}
          <input className="field font-normal" value={medicine} maxLength={80} placeholder="For example amoxicillin" onChange={(event) => onChange(event.target.value)} />
        </label>
      </div>
    </div>
  );
}

function resultsNote(feeling: Feeling | null, shown: readonly Place[]): string {
  if (feeling !== "emergency") return "";
  if (shown.some((place) => place.emergency === "yes")) {
    return "Hospitals that list an emergency room come first. Others may not have one, so call 911 if you are unsure.";
  }
  return "None of these hospitals list an emergency room on the map. Call 911 and they will send help.";
}

export function CareView() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [found, setFound] = useState<Found | null>(null);
  const [feeling, setFeeling] = useState<Feeling | null>(null);
  const [only24Hours, setOnly24Hours] = useState(false);
  const [medicine, setMedicine] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const mapBox = useRef<HTMLDivElement>(null);

  const shown = useMemo(() => (found ? placesFor(found.places, feeling, only24Hours) : []), [found, feeling, only24Hours]);
  const busy = status.kind === "locating" || status.kind === "loading";
  const medicineName = medicine.trim();

  async function lookUp(body: CareRequest) {
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setStatus({ kind: "loading" });
    try {
      const response = await fetch("/api/care", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const data = (await response.json()) as CareResponse;
      if ("error" in data) {
        setStatus({ kind: "error", message: data.error });
        return;
      }
      setFound({ center: data.center, places: data.places });
      setSelectedId(null);
      setStatus({ kind: "idle" });
    } catch {
      if (controller.signal.aborted) return;
      setStatus({ kind: "error", message: "We could not reach the server. Check your connection and try again." });
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = query.trim();
    if (text === "") {
      setStatus({ kind: "error", message: "Type a ZIP code or a city name, like 92130 or San Diego." });
      return;
    }
    void lookUp({ query: text });
  }

  function locateMe() {
    if (!("geolocation" in navigator)) {
      setStatus({ kind: "error", message: "This browser cannot share your location. Type a ZIP code or city instead." });
      return;
    }
    setStatus({ kind: "locating" });
    navigator.geolocation.getCurrentPosition(
      (position) => void lookUp({ lat: position.coords.latitude, lon: position.coords.longitude }),
      (error) => setStatus({ kind: "error", message: geoErrorMessage(error) }),
      { enableHighAccuracy: false, timeout: GEO_TIMEOUT_MS, maximumAge: 60_000 },
    );
  }

  function showOnMap(id: string) {
    setSelectedId(id);
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    mapBox.current?.scrollIntoView({ behavior: reduced ? "auto" : "smooth", block: "center" });
  }

  const note = resultsNote(feeling, shown);

  return (
    <div className="pt-6 grid gap-10">
      <section className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)] lg:gap-10">
        <div>
          <h1 className="text-3xl font-medium narrow">Find care near you</h1>
          <p className="mt-3">
            Find a pharmacy, an urgent care or a hospital nearby. Tell us how you feel and the right places come first.
          </p>
          <p className="mt-2 text-ink-soft">Shelf Check does not diagnose. If you are not sure how serious it is, call your doctor or 911.</p>
        </div>
        <div className="facts grid gap-4">
          <form onSubmit={onSubmit} className="grid gap-3">
            <label htmlFor="care-place" className="font-bold">
              ZIP code or city
            </label>
            <div className="flex flex-wrap gap-3">
              <input
                id="care-place"
                className="field flex-1 min-w-[12rem]"
                autoComplete="postal-code"
                maxLength={100}
                placeholder="For example 92130"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
              <button type="submit" className="btn" disabled={busy}>
                Find places
              </button>
            </div>
          </form>
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-quiet" onClick={locateMe} disabled={busy}>
              Use my location
            </button>
            <span className="text-sm text-ink-soft">Your location is only used to look up places nearby. It is not saved.</span>
          </div>
          <p aria-live="polite" className="text-sm">
            {status.kind === "locating" && "Asking your browser for your location."}
            {status.kind === "loading" && "Looking up places. When the map service is busy this can take up to a minute."}
            {status.kind === "error" && <span className="text-[var(--stop-text)] font-bold">{status.message}</span>}
          </p>
        </div>
      </section>

      <section aria-labelledby="feeling-title" className="grid gap-4">
        <h2 id="feeling-title" className="text-3xl font-medium narrow">
          How do you feel
        </h2>
        <FeelingPicker value={feeling} onChange={setFeeling} labelledBy="feeling-title" />
        {feeling === "emergency" && <EmergencyNotice />}
        {feeling !== "emergency" && <MedicinePicker medicine={medicine} onChange={setMedicine} />}
      </section>

      <section aria-labelledby="places-title" className="grid gap-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <h2 id="places-title" className="text-3xl font-medium narrow">
            Places near you
          </h2>
          <label className="flex items-center gap-3">
            <input type="checkbox" className="h-5 w-5 accent-[var(--accent)]" checked={only24Hours} onChange={(event) => setOnly24Hours(event.target.checked)} />
            Open 24 hours only
          </label>
        </div>

        {!found && <p className="facts text-ink-soft">Type a ZIP code or city above, or use your location, to see places within {RADIUS_MILES} miles.</p>}

        {found && (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:items-start">
            <div ref={mapBox} className="lg:sticky lg:top-[140px]">
              <CareMap center={found.center} places={shown} selectedId={selectedId} onSelect={setSelectedId} />
              <Legend />
            </div>
            <div className="grid gap-4">
              <p role="status" className="label">
                {shown.length} {shown.length === 1 ? "place" : "places"} within {RADIUS_MILES} miles of {found.center.label}
              </p>
              {note && <p className="quote">{note}</p>}
              {medicineName !== "" && feeling !== "emergency" && (
                <p className="quote">Pharmacies stock different medicines. Calling first saves a trip.</p>
              )}
              {shown.length === 0 && (
                <p className="facts">
                  {only24Hours && found.places.length > 0
                    ? "None of these places list 24 hour opening. Turn off the 24 hours filter to see them all."
                    : "No places found here. Try a nearby ZIP code."}
                </p>
              )}
              <PlaceList places={shown} medicine={feeling === "emergency" ? "" : medicineName} selectedId={selectedId} onShow={showOnMap} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
