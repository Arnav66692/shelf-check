export type PlaceKind = "pharmacy" | "urgent_care" | "clinic" | "hospital";

export type Emergency = "yes" | "no" | "unknown";

export type Place = {
  readonly id: string;
  readonly name: string;
  readonly kind: PlaceKind;
  readonly emergency: Emergency;
  readonly lat: number;
  readonly lon: number;
  readonly phone?: string;
  readonly openingHours?: string;
  readonly website?: string;
  readonly address?: string;
  readonly distanceKm: number;
};

export type CareCenter = { readonly lat: number; readonly lon: number; readonly label: string };

export type CareResponse = { readonly center: CareCenter; readonly places: readonly Place[] } | { readonly error: string };

export type CareRequest = { readonly query: string } | { readonly lat: number; readonly lon: number };

export type Feeling = "emergency" | "today" | "medicine";

export const SEARCH_RADIUS_KM = 8;

const EARTH_RADIUS_KM = 6371;

export function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

const KM_PER_MILE = 1.609344;

export function formatDistance(km: number): string {
  const miles = km / KM_PER_MILE;
  return miles < 0.1 ? "Under 0.1 mi" : `${miles.toFixed(1)} mi`;
}

export function isOpen24Hours(place: Place): boolean {
  return place.openingHours?.trim() === "24/7";
}

export function hoursText(place: Place): string {
  if (isOpen24Hours(place)) return "Open 24 hours";
  return place.openingHours?.trim() || "Hours not listed";
}

export const KIND_LABEL: Record<PlaceKind, string> = {
  pharmacy: "Pharmacy",
  urgent_care: "Urgent care",
  clinic: "Clinic",
  hospital: "Hospital",
};

export function kindLabel(place: Place): string {
  if (place.kind === "hospital" && place.emergency === "yes") return "Hospital with emergency room";
  return KIND_LABEL[place.kind];
}

export type MarkerKind = "pharmacy" | "urgent_care" | "clinic" | "emergency" | "hospital";

export function markerKind(place: Place): MarkerKind {
  if (place.kind === "hospital") return place.emergency === "yes" ? "emergency" : "hospital";
  return place.kind;
}

export function directionsUrl(place: Place): string {
  return `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lon}`;
}

export function telHref(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, "")}`;
}

const TODAY_RANK: Record<PlaceKind, number> = { urgent_care: 0, hospital: 1, clinic: 2, pharmacy: 3 };
const MEDICINE_RANK: Record<PlaceKind, number> = { pharmacy: 0, urgent_care: 1, clinic: 2, hospital: 3 };

function byRankThenDistance(rank: (place: Place) => number) {
  return (a: Place, b: Place) => rank(a) - rank(b) || a.distanceKm - b.distanceKm;
}

export function placesFor(places: readonly Place[], feeling: Feeling | null, only24Hours: boolean): readonly Place[] {
  const open = only24Hours ? places.filter(isOpen24Hours) : places;
  if (feeling === "emergency") {
    return open
      .filter((place) => place.kind === "hospital" && place.emergency !== "no")
      .toSorted(byRankThenDistance((place) => (place.emergency === "yes" ? 0 : 1)));
  }
  if (feeling === "today") return open.toSorted(byRankThenDistance((place) => TODAY_RANK[place.kind]));
  if (feeling === "medicine") return open.toSorted(byRankThenDistance((place) => MEDICINE_RANK[place.kind]));
  return open.toSorted((a, b) => a.distanceKm - b.distanceKm);
}
