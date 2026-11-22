import type { Severity } from "@/lib/model";

export const SYRINGE_UNITS = 100;
export const SYRINGE_ML = 1;
const UNITS_PER_ML = SYRINGE_UNITS / SYRINGE_ML;
const SMALLEST_MEASURABLE_UNITS = 1;
const SMALLEST_SHOWN = 0.0001;
const DECIMAL = /^(?:\d+\.?\d*|\.\d+)$/;

export type Draw =
  | { readonly kind: "fits"; readonly mL: number; readonly units: number }
  | { readonly kind: "too_large"; readonly mL: number; readonly units: number }
  | { readonly kind: "too_small"; readonly mL: number; readonly units: number };

export type Parsed = { readonly value: number } | { readonly error: string } | { readonly blank: true };

export function parseAmount(text: string, field: string): Parsed {
  const trimmed = text.trim();
  if (trimmed === "") return { blank: true };
  if (!DECIMAL.test(trimmed)) {
    return { error: `${field}: "${trimmed}" is not a number. Use digits and one decimal point, for example 0.25.` };
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0) return { error: `${field} must be more than 0.` };
  return { value };
}

export function planDraw(mL: number): Draw {
  const units = mL * UNITS_PER_ML;
  if (mL > SYRINGE_ML) return { kind: "too_large", mL, units };
  if (units < SMALLEST_MEASURABLE_UNITS) return { kind: "too_small", mL, units };
  return { kind: "fits", mL, units };
}

export function formatAmount(value: number): string {
  if (value === 0) return "0";
  if (value < SMALLEST_SHOWN) return `less than ${SMALLEST_SHOWN}`;
  if (value >= 1) return Number(value.toFixed(2)).toString();
  return Number(value.toPrecision(3)).toString();
}

const SEVERITY_LABEL: Record<Severity, string> = { stop: "Stop", ask: "Ask first", info: "Note" };
const SEVERITY_STYLE: Record<Severity, string> = {
  stop: "bg-[var(--stop)] text-[#191a1e]",
  ask: "bg-[var(--ask)] text-black",
  info: "bg-[var(--ok)]",
};

export function SeverityBadge({ severity }: { severity: Severity }) {
  return (
    <span
      className={`px-2.5 py-1 text-[13px] italic font-[900] uppercase tracking-[-0.02em] rounded-full ${SEVERITY_STYLE[severity]}`}
    >
      {SEVERITY_LABEL[severity]}
    </span>
  );
}

export function Notice({ severity, title, children }: { severity: Severity; title: string; children: React.ReactNode }) {
  return (
    <div className="facts" role={severity === "info" ? undefined : "alert"}>
      <SeverityBadge severity={severity} />
      <h3 className="mt-2 text-lg font-semibold">{title}</h3>
      <div className="mt-1 grid gap-2">{children}</div>
    </div>
  );
}

function Drawing({ units }: { units: number }) {
  const barrelX = 40;
  const barrelWidth = 500;
  const fillWidth = (units / SYRINGE_UNITS) * barrelWidth;
  return (
    <svg
      viewBox="0 0 620 120"
      role="img"
      aria-label={`U-100 insulin syringe drawn to the ${formatAmount(units)} unit mark`}
      className="w-full"
    >
      <rect x={barrelX} y="30" width={barrelWidth} height="44" fill="var(--panel)" stroke="var(--ink)" strokeWidth="3" />
      <rect x={barrelX} y="30" width={fillWidth} height="44" fill="var(--ok)" opacity="0.35" />
      <line x1={barrelX + fillWidth} y1="22" x2={barrelX + fillWidth} y2="82" stroke="var(--stop)" strokeWidth="4" />
      {Array.from({ length: 11 }, (_, index) => {
        const x = barrelX + (index / 10) * barrelWidth;
        return (
          <g key={index}>
            <line x1={x} y1="74" x2={x} y2="88" stroke="var(--ink)" strokeWidth="2" />
            <text x={x} y="106" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)">
              {index * 10}
            </text>
          </g>
        );
      })}
      <rect x="6" y="46" width="34" height="12" fill="var(--ink)" />
      <rect x={barrelX + barrelWidth} y="48" width="70" height="8" fill="var(--ink)" />
    </svg>
  );
}

export function Syringe({ draw }: { draw: Draw }) {
  if (draw.kind === "too_large") {
    return (
      <Notice severity="stop" title="Too large for this syringe">
        <p>
          This dose is {formatAmount(draw.mL)} mL, which is {formatAmount(draw.units)} units. A U-100 insulin syringe holds{" "}
          {SYRINGE_ML} mL, which is {SYRINGE_UNITS} units, so no mark is shown. Do not inject. A number this large often
          means a number was typed in the wrong unit. Ask the pharmacist or the prescriber.
        </p>
      </Notice>
    );
  }
  if (draw.kind === "too_small") {
    return (
      <Notice severity="ask" title="Too small to measure">
        <p>
          This dose is {formatAmount(draw.mL)} mL, which is {formatAmount(draw.units)} units. That is less than{" "}
          {SMALLEST_MEASURABLE_UNITS} unit on a U-100 syringe, so no mark is shown. Ask the pharmacist how to measure it.
        </p>
      </Notice>
    );
  }
  return (
    <div>
      <Drawing units={draw.units} />
      <div className="facts-row">
        <span>Draw to</span>
        <span className="font-bold">
          {formatAmount(draw.units)} units, which is {formatAmount(draw.mL)} mL
        </span>
      </div>
    </div>
  );
}
