import { directionsUrl, formatDistance, hoursText, isOpen24Hours, kindLabel, markerKind, telHref, type Place } from "./places";

type CardProps = {
  readonly place: Place;
  readonly medicine: string;
  readonly isSelected: boolean;
  readonly onShow: (id: string) => void;
};

function StockLine({ place, medicine }: { place: Place; medicine: string }) {
  if (place.kind !== "pharmacy" || medicine === "") return null;
  if (!place.phone) {
    return <p className="mt-2 quote">No phone number is listed. Ask at the counter if they have {medicine} in stock.</p>;
  }
  return (
    <p className="mt-2 quote">
      <a href={telHref(place.phone)} className="underline font-bold">
        Call to ask if they have {medicine} in stock
      </a>
    </p>
  );
}

function PlaceCard({ place, medicine, isSelected, onShow }: CardProps) {
  return (
    <li className={`facts${isSelected ? " !border-[var(--accent)]" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <span className="label flex items-center">
          <span className={`care-key care-marker care-marker--${markerKind(place)}`} aria-hidden="true" />
          {kindLabel(place)}
        </span>
        <span className="label">{formatDistance(place.distanceKm)} away</span>
      </div>
      <h3 className="mt-2 text-lg font-semibold text-ink">{place.name}</h3>
      {place.address && <p className="text-ink-soft">{place.address}</p>}
      <p className={isOpen24Hours(place) ? "font-bold text-[var(--ok)]" : "text-ink-soft"}>{hoursText(place)}</p>
      <StockLine place={place} medicine={medicine} />
      <div className="mt-4 flex flex-wrap gap-3">
        {place.phone ? (
          <a href={telHref(place.phone)} className="btn" aria-label={`Call ${place.name} at ${place.phone}`}>
            Call {place.phone}
          </a>
        ) : (
          <span className="label self-center">No phone listed</span>
        )}
        <a href={directionsUrl(place)} target="_blank" rel="noopener noreferrer" className="btn btn-quiet">
          Directions<span className="sr-only"> to {place.name}, opens Google Maps</span>
        </a>
        <button type="button" className="btn btn-quiet" onClick={() => onShow(place.id)}>
          Show on map<span className="sr-only">: {place.name}</span>
        </button>
      </div>
      {place.website && (
        <p className="mt-3">
          <a href={place.website} target="_blank" rel="noopener noreferrer" className="underline">
            Website<span className="sr-only"> for {place.name}</span>
          </a>
        </p>
      )}
    </li>
  );
}

type ListProps = {
  readonly places: readonly Place[];
  readonly medicine: string;
  readonly selectedId: string | null;
  readonly onShow: (id: string) => void;
};

export function PlaceList({ places, medicine, selectedId, onShow }: ListProps) {
  return (
    <ul className="grid gap-4" aria-label="Places near you">
      {places.map((place) => (
        <PlaceCard key={place.id} place={place} medicine={medicine} isSelected={place.id === selectedId} onShow={onShow} />
      ))}
    </ul>
  );
}
