"use client";

import { useMemo, useState } from "react";
import { Syringe } from "./Syringe";
import { checkInjectionDose, InvalidDoseInputError, type DoseUnit, type InjectionCheck } from "@engine/flags/units.ts";

const UNIT_LABEL: Record<DoseUnit, string> = { mg: "mg", mL: "mL", units: "units on an insulin syringe" };
function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

export function DoseView() {
  const [concentration, setConcentration] = useState("5");
  const [doseValue, setDoseValue] = useState("0.25");
  const [doseUnit, setDoseUnit] = useState<DoseUnit>("mg");
  const [alsoValue, setAlsoValue] = useState("25");
  const [alsoUnit, setAlsoUnit] = useState<DoseUnit>("units");

  const outcome = useMemo((): { check?: InjectionCheck; error?: string } => {
    const mgPerMl = Number(concentration);
    const dose = Number(doseValue);
    if (!(mgPerMl > 0) || !(dose > 0)) return { error: "Enter the strength on the vial and the dose you were told." };
    const also = Number(alsoValue);
    try {
      return {
        check: checkInjectionDose({
          itemId: "vial",
          concentrationMgPerMl: mgPerMl,
          prescribed: { value: dose, unit: doseUnit },
          alsoStated: also > 0 ? { value: also, unit: alsoUnit } : undefined,
          syringe: "u100_insulin",
        }),
      };
    } catch (error) {
      if (error instanceof InvalidDoseInputError) return { error: error.message };
      throw error;
    }
  }, [concentration, doseValue, doseUnit, alsoValue, alsoUnit]);

  return (
    <div className="pt-6 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <section>
        <h1 className="text-3xl font-extrabold narrow">Dose check for injections</h1>
        <p className="mt-3">
          Vials are labelled in milligrams per millilitre. Doses get written in milligrams, millilitres or syringe
          units. The FDA has reports of people drawing 50 units when the dose was 5. Type what your vial and your
          instructions say, and see where the plunger should stop.
        </p>
        <div className="mt-6 grid gap-4">
          <label className="grid gap-1 font-bold">
            Strength on the vial, in mg per mL
            <input className="field font-normal" inputMode="decimal" value={concentration} onChange={(event) => setConcentration(event.target.value)} />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="grid gap-1 font-bold">
              Dose you were told
              <input className="field font-normal" inputMode="decimal" value={doseValue} onChange={(event) => setDoseValue(event.target.value)} />
            </label>
            <select aria-label="Dose unit" className="field font-normal w-auto" value={doseUnit} onChange={(event) => setDoseUnit(event.target.value as DoseUnit)}>
              {(Object.keys(UNIT_LABEL) as DoseUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="grid gap-1 font-bold">
              The same dose as written a second way, if your instructions give one
              <input className="field font-normal" inputMode="decimal" value={alsoValue} onChange={(event) => setAlsoValue(event.target.value)} />
            </label>
            <select aria-label="Second unit" className="field font-normal w-auto" value={alsoUnit} onChange={(event) => setAlsoUnit(event.target.value as DoseUnit)}>
              {(Object.keys(UNIT_LABEL) as DoseUnit[]).map((unit) => (
                <option key={unit} value={unit}>
                  {UNIT_LABEL[unit]}
                </option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section aria-live="polite">
        <h2 className="text-3xl font-extrabold narrow">Where the plunger stops</h2>
        {outcome.error && <p className="mt-4 text-ink-soft">{outcome.error}</p>}
        {outcome.check && (
          <div className="mt-4 grid gap-4">
            <div className="facts">
              <Syringe fillUnits={outcome.check.dose.u100Units} />
              <div className="facts-row">
                <span>Milligrams</span>
                <span className="font-bold">{round(outcome.check.dose.mg)} mg</span>
              </div>
              <div className="facts-row">
                <span>Millilitres</span>
                <span className="font-bold">{round(outcome.check.dose.mL)} mL</span>
              </div>
              <div className="facts-row">
                <span>Units on a U-100 insulin syringe</span>
                <span className="font-bold">{round(outcome.check.dose.u100Units)} units</span>
              </div>
            </div>
            {outcome.check.flags.map((flag) => (
              <div key={flag.title} className="facts" role="alert">
                <span className="px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide bg-[var(--stop)] text-white">Stop</span>
                <h3 className="mt-2 text-lg font-extrabold">{flag.title}</h3>
                <p className="mt-1">{flag.detail}</p>
              </div>
            ))}
            <p className="text-sm text-ink-soft">
              This is arithmetic on the numbers you typed. It cannot tell what is inside a vial. Confirm the dose with
              the prescriber or pharmacist before injecting.
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
