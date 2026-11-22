"use client";

import { ModelPanel } from "./ModelPanel";
import { useState } from "react";
import { formatAmount, Notice, parseAmount, planDraw, SeverityBadge, Syringe, type Draw } from "./Syringe";
import { checkInjectionDose, InvalidDoseInputError, type DoseUnit, type InjectionCheck } from "@engine/flags/units.ts";
import type { Flag } from "@engine/types.ts";

const UNIT_LABEL: Record<DoseUnit, string> = { mg: "mg", mL: "mL", units: "marks on a U-100 syringe" };
const INSULIN_STRENGTHS = ["U-100", "U-200", "U-300", "U-500", "Other or not sure"] as const;
type InsulinStrength = (typeof INSULIN_STRENGTHS)[number];
const U100_UNITS_PER_ML = 100;

type Outcome =
  | { kind: "empty"; message: string }
  | { kind: "invalid"; message: string }
  | { kind: "insulin_other"; strength: InsulinStrength }
  | { kind: "insulin"; units: number; draw: Draw }
  | { kind: "vial"; check: InjectionCheck; draw: Draw };

function readField(text: string, field: string): { value?: number; error?: string } {
  const parsed = parseAmount(text, field);
  if ("error" in parsed) return { error: parsed.error };
  if ("value" in parsed) return { value: parsed.value };
  return {};
}

function insulinOutcome(strength: InsulinStrength, doseText: string): Outcome {
  if (strength !== "U-100") return { kind: "insulin_other", strength };
  const dose = readField(doseText, "Dose in units");
  if (dose.error) return { kind: "invalid", message: dose.error };
  if (dose.value === undefined) return { kind: "empty", message: "Type the number of units you were told to take." };
  return { kind: "insulin", units: dose.value, draw: planDraw(dose.value / U100_UNITS_PER_ML) };
}

function vialOutcome(concentrationText: string, doseText: string, doseUnit: DoseUnit, alsoText: string, alsoUnit: DoseUnit): Outcome {
  const strength = readField(concentrationText, "Strength on the vial");
  const dose = readField(doseText, "Dose you were told");
  const also = readField(alsoText, "Second way the dose is written");
  const error = strength.error ?? dose.error ?? also.error;
  if (error) return { kind: "invalid", message: error };
  if (strength.value === undefined || dose.value === undefined) {
    return { kind: "empty", message: "Type the strength printed on the vial and the dose you were told. The syringe appears here." };
  }
  try {
    const check = checkInjectionDose({
      itemId: "vial",
      concentrationMgPerMl: strength.value,
      prescribed: { value: dose.value, unit: doseUnit },
      alsoStated: also.value === undefined ? undefined : { value: also.value, unit: alsoUnit },
      syringe: "u100_insulin",
    });
    return { kind: "vial", check, draw: planDraw(check.dose.mL) };
  } catch (caught) {
    if (caught instanceof InvalidDoseInputError) return { kind: "invalid", message: caught.message };
    throw caught;
  }
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="facts-row">
      <span>{label}</span>
      <span className="font-bold">{value}</span>
    </div>
  );
}

function FlagNotice({ flag }: { flag: Flag }) {
  return (
    <div className="facts" role="alert">
      <SeverityBadge severity={flag.severity} />
      <h3 className="mt-2 text-lg font-semibold">{flag.title}</h3>
      <p className="mt-1">{flag.detail}</p>
    </div>
  );
}

function InsulinOther({ strength }: { strength: InsulinStrength }) {
  const title = strength === "U-500" ? "U-500 insulin needs its own syringe or pen" : `${strength} insulin is not drawn by U-100 marks`;
  return (
    <Notice severity="stop" title={title}>
      {strength === "U-500" ? (
        <p>
          U-500 insulin is five times stronger than U-100. Do not use the unit marks on a U-100 syringe for it. Use the
          U-500 syringe or the U-500 pen your pharmacy gave you, and follow your pharmacist&apos;s instructions.
        </p>
      ) : (
        <p>
          The marks on a U-100 syringe only match U-100 insulin. Do not draw this insulin into a U-100 syringe by its unit
          marks. Use the pen or syringe made for this strength, and follow your pharmacist&apos;s instructions.
        </p>
      )}
      <p>No syringe mark is shown for this insulin.</p>
    </Notice>
  );
}

function VialResult({ check, draw }: { check: InjectionCheck; draw: Draw }) {
  const blocked = check.drawTo === null || check.flags.some((flag) => flag.severity === "stop" || flag.type === "dose_volume");
  return (
    <div className="mt-4 grid gap-4">
      {check.flags.map((flag) => (
        <FlagNotice key={flag.title} flag={flag} />
      ))}
      <div className="facts">
        {blocked ? (
          <p className="font-bold">No syringe mark is shown. Read the notice above and ask the pharmacist.</p>
        ) : (
          <Syringe draw={draw} />
        )}
        <Row label="Milligrams" value={`${formatAmount(check.dose.mg)} mg`} />
        <Row label="Millilitres" value={`${formatAmount(check.dose.mL)} mL`} />
        <Row label="Units on a U-100 insulin syringe" value={`${formatAmount(draw.units)} units`} />
      </div>
    </div>
  );
}

function InsulinResult({ units, draw }: { units: number; draw: Draw }) {
  return (
    <div className="mt-4 grid gap-4">
      <div className="facts">
        <Syringe draw={draw} />
        <Row label="Units of U-100 insulin" value={`${formatAmount(units)} units`} />
        <Row label="Millilitres" value={`${formatAmount(draw.mL)} mL`} />
      </div>
    </div>
  );
}

function UnitSelect({ label, value, onChange }: { label: string; value: DoseUnit; onChange: (next: DoseUnit) => void }) {
  return (
    <select aria-label={label} className="field font-normal w-auto" value={value} onChange={(event) => onChange(event.target.value as DoseUnit)}>
      {(Object.keys(UNIT_LABEL) as DoseUnit[]).map((unit) => (
        <option key={unit} value={unit}>
          {UNIT_LABEL[unit]}
        </option>
      ))}
    </select>
  );
}

export function DoseView() {
  const [isInsulin, setIsInsulin] = useState<boolean | null>(null);
  const [insulinStrength, setInsulinStrength] = useState<InsulinStrength>("U-100");
  const [concentration, setConcentration] = useState("");
  const [doseValue, setDoseValue] = useState("");
  const [doseUnit, setDoseUnit] = useState<DoseUnit>("mg");
  const [alsoValue, setAlsoValue] = useState("");
  const [alsoUnit, setAlsoUnit] = useState<DoseUnit>("units");

  const outcome: Outcome = isInsulin === null
    ? { kind: "empty", message: "First choose whether this is insulin. Insulin syringes and pens need a different check." }
    : isInsulin
    ? insulinOutcome(insulinStrength, doseValue)
    : vialOutcome(concentration, doseValue, doseUnit, alsoValue, alsoUnit);

  return (
    <div className="pt-6 grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section>
        <h1 className="text-3xl font-medium narrow">Dose check for injections</h1>
        <p className="mt-3">
          Vials are labelled in milligrams per millilitre. Doses get written in milligrams, millilitres or syringe
          units. The FDA has reports of people drawing 50 units when the dose was 5. Type what your vial and your
          instructions say, and see where the plunger should stop.
        </p>
        <div className="mt-6 grid gap-4">
          <fieldset className="grid gap-2">
            <legend className="font-bold">Is this insulin?</legend>
            <label className="flex items-center gap-3">
              <input type="radio" name="insulin" className="h-5 w-5 accent-[var(--ink)]" checked={isInsulin === false} onChange={() => setIsInsulin(false)} />
              No, another medicine in a vial
            </label>
            <label className="flex items-center gap-3">
              <input type="radio" name="insulin" className="h-5 w-5 accent-[var(--ink)]" checked={isInsulin === true} onChange={() => setIsInsulin(true)} />
              Yes, insulin
            </label>
          </fieldset>

          {isInsulin === null ? null : isInsulin ? (
            <>
              <label className="grid gap-1 font-bold">
                The U number on the insulin box or vial
                <select className="field font-normal" value={insulinStrength} onChange={(event) => setInsulinStrength(event.target.value as InsulinStrength)}>
                  {INSULIN_STRENGTHS.map((strength) => (
                    <option key={strength} value={strength}>
                      {strength}
                    </option>
                  ))}
                </select>
              </label>
              {insulinStrength === "U-100" && (
                <label className="grid gap-1 font-bold">
                  Dose you were told, in units
                  <input className="field font-normal" inputMode="decimal" placeholder="For example 10" value={doseValue} onChange={(event) => setDoseValue(event.target.value)} />
                </label>
              )}
            </>
          ) : (
            <>
              <label className="grid gap-1 font-bold">
                Strength on the vial, in mg per mL
                <input className="field font-normal" inputMode="decimal" placeholder="For example 5" value={concentration} onChange={(event) => setConcentration(event.target.value)} />
              </label>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <label className="grid gap-1 font-bold">
                  Dose you were told
                  <input className="field font-normal" inputMode="decimal" placeholder="For example 0.25" value={doseValue} onChange={(event) => setDoseValue(event.target.value)} />
                </label>
                <UnitSelect label="Dose unit" value={doseUnit} onChange={setDoseUnit} />
              </div>
              <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
                <label className="grid gap-1 font-bold">
                  The same dose as written a second way, if your instructions give one
                  <input className="field font-normal" inputMode="decimal" value={alsoValue} onChange={(event) => setAlsoValue(event.target.value)} />
                </label>
                <UnitSelect label="Second unit" value={alsoUnit} onChange={setAlsoUnit} />
              </div>
            </>
          )}
        </div>
      </section>

      <section aria-live="polite">
        <h2 className="text-3xl font-medium narrow">Where the plunger stops</h2>
        {outcome.kind === "empty" && (
          <>
            <p className="mt-4 text-ink-soft">{outcome.message}</p>
            <ModelPanel name="syringe" caption="U-100 insulin syringe" className="mt-6" />
          </>
        )}
        {outcome.kind === "invalid" && (
          <p className="mt-4 facts" role="alert">
            {outcome.message}
          </p>
        )}
        {outcome.kind === "insulin_other" && (
          <div className="mt-4">
            <InsulinOther strength={outcome.strength} />
          </div>
        )}
        {outcome.kind === "insulin" && <InsulinResult units={outcome.units} draw={outcome.draw} />}
        {outcome.kind === "vial" && <VialResult check={outcome.check} draw={outcome.draw} />}
        {(outcome.kind === "insulin" || outcome.kind === "vial") && (
          <p className="mt-4 text-sm text-ink-soft">
            This is arithmetic on the numbers you typed. It cannot tell what is inside a vial. Confirm the dose with the
            prescriber or pharmacist before injecting.
          </p>
        )}
      </section>
    </div>
  );
}
