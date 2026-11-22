import type { Feeling } from "./places";

const LEVELS: readonly { readonly id: Feeling; readonly title: string; readonly detail: string }[] = [
  {
    id: "emergency",
    title: "Emergency",
    detail: "Chest pain, trouble breathing, signs of a stroke, a seizure, an overdose or bleeding that will not stop.",
  },
  {
    id: "today",
    title: "Needs a doctor today",
    detail: "A sprain, a cut that may need stitches, a high fever or a bad reaction to a medicine.",
  },
  {
    id: "medicine",
    title: "Needs a medicine",
    detail: "You know what you need and want a pharmacy nearby.",
  },
];

type Props = { readonly value: Feeling | null; readonly onChange: (next: Feeling) => void; readonly labelledBy: string };

export function FeelingPicker({ value, onChange, labelledBy }: Props) {
  return (
    <fieldset className="grid gap-3" aria-labelledby={labelledBy}>
      {LEVELS.map((level) => (
        <label key={level.id} className={`care-level${level.id === "emergency" ? " care-level--emergency" : ""}`}>
          <span className="flex items-center gap-3">
            <input
              type="radio"
              name="feeling"
              value={level.id}
              className="sr-only"
              checked={value === level.id}
              onChange={() => onChange(level.id)}
              aria-labelledby={`feeling-${level.id}`}
              aria-describedby={`feeling-${level.id}-detail`}
            />
            <span id={`feeling-${level.id}`} className={`label !text-[13px] ${level.id === "emergency" ? "!text-[var(--stop-text)]" : "!text-ink"}`}>{level.title}</span>
          </span>
          <span id={`feeling-${level.id}-detail`} className="text-ink-soft">
            {level.detail}
          </span>
        </label>
      ))}
    </fieldset>
  );
}

export function EmergencyNotice() {
  return (
    <div className="facts care-911 grid gap-3" role="alert">
      <p className="text-2xl font-semibold text-ink">
        <a href="tel:911" className="underline">
          Call 911 now.
        </a>
      </p>
      <p>If this could be an emergency, call 911 before anything else. Do not drive yourself.</p>
      <ul className="grid gap-1">
        <li>
          Poison Help:{" "}
          <a href="tel:18002221222" className="underline font-bold">
            1-800-222-1222
          </a>
        </li>
        <li>
          Mental health crisis: call or text{" "}
          <a href="tel:988" className="underline font-bold">
            988
          </a>
        </li>
      </ul>
    </div>
  );
}
