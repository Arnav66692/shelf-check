"use client";

import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { useEffect, useRef, useState, type RefObject } from "react";
import { AttributionControl, MapContainer, Marker, Popup, TileLayer, useMap } from "react-leaflet";
import { formatDistance, kindLabel, markerKind, type CareCenter, type MarkerKind, type Place } from "./places";

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
const LEAFLET_PREFIX = '<a href="https://leafletjs.com">Leaflet</a>';
const START_ZOOM = 13;
const MAX_FIT_ZOOM = 15;
const FOCUS_ZOOM = 16;
const FIT_COUNT = 12;
const MARKER_SIZE = 14;
const YOU_SIZE = 20;

function squareIcon(kind: MarkerKind, selected: boolean): L.DivIcon {
  return L.divIcon({
    className: `care-marker care-marker--${kind}${selected ? " care-marker--selected" : ""}`,
    iconSize: [MARKER_SIZE, MARKER_SIZE],
    popupAnchor: [0, -MARKER_SIZE / 2],
    html: "",
  });
}

const MARKER_KINDS: readonly MarkerKind[] = ["pharmacy", "urgent_care", "clinic", "emergency", "hospital"];
const ICONS = {
  normal: Object.fromEntries(MARKER_KINDS.map((kind) => [kind, squareIcon(kind, false)])) as Record<MarkerKind, L.DivIcon>,
  selected: Object.fromEntries(MARKER_KINDS.map((kind) => [kind, squareIcon(kind, true)])) as Record<MarkerKind, L.DivIcon>,
};

const YOU_ICON = L.divIcon({ className: "care-marker care-marker--you", iconSize: [YOU_SIZE, YOU_SIZE], html: "" });

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function FitToPlaces({ center, places }: { center: CareCenter; places: readonly Place[] }) {
  const map = useMap();
  useEffect(() => {
    const nearest = places.slice(0, FIT_COUNT).map((place): L.LatLngTuple => [place.lat, place.lon]);
    const origin: L.LatLngTuple = [center.lat, center.lon];
    if (nearest.length === 0) {
      map.setView(origin, START_ZOOM, { animate: false });
      return;
    }
    map.fitBounds(L.latLngBounds([origin, ...nearest]), { padding: [32, 32], maxZoom: MAX_FIT_ZOOM, animate: !prefersReducedMotion() });
  }, [map, center, places]);
  return null;
}

function FocusSelected({ place, markers }: { place: Place | undefined; markers: RefObject<Map<string, L.Marker>> }) {
  const map = useMap();
  useEffect(() => {
    if (!place) return;
    const target: L.LatLngTuple = [place.lat, place.lon];
    const zoom = Math.max(map.getZoom(), FOCUS_ZOOM);
    if (prefersReducedMotion()) map.setView(target, zoom, { animate: false });
    else map.flyTo(target, zoom, { duration: 0.6 });
    markers.current.get(place.id)?.openPopup();
  }, [map, place, markers]);
  return null;
}

type Props = {
  readonly center: CareCenter;
  readonly places: readonly Place[];
  readonly selectedId: string | null;
  readonly onSelect: (id: string) => void;
};

export function CareMap({ center, places, selectedId, onSelect }: Props) {
  const markers = useRef(new Map<string, L.Marker>());
  const [reduced] = useState(prefersReducedMotion);
  const selected = places.find((place) => place.id === selectedId);

  return (
    <div className="care-map" role="region" aria-label="Map of places near you. The same places are in the list.">
      <MapContainer
        center={[center.lat, center.lon]}
        zoom={START_ZOOM}
        scrollWheelZoom={false}
        attributionControl={false}
        zoomAnimation={!reduced}
        fadeAnimation={!reduced}
        markerZoomAnimation={!reduced}
      >
        <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />
        <AttributionControl prefix={LEAFLET_PREFIX} />
        <Marker position={[center.lat, center.lon]} icon={YOU_ICON} title={center.label} alt={center.label} keyboard={false} />
        {places.map((place) => {
          const kind = markerKind(place);
          return (
            <Marker
              key={place.id}
              position={[place.lat, place.lon]}
              icon={place.id === selectedId ? ICONS.selected[kind] : ICONS.normal[kind]}
              title={`${place.name}, ${kindLabel(place)}`}
              alt={`${place.name}, ${kindLabel(place)}`}
              eventHandlers={{ click: () => onSelect(place.id) }}
              ref={(marker) => {
                if (marker) markers.current.set(place.id, marker);
                else markers.current.delete(place.id);
              }}
            >
              <Popup>
                <strong>{place.name}</strong>
                <br />
                {kindLabel(place)}, {formatDistance(place.distanceKm)}
              </Popup>
            </Marker>
          );
        })}
        <FitToPlaces center={center} places={places} />
        <FocusSelected place={selected} markers={markers} />
      </MapContainer>
    </div>
  );
}
