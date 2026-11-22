"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import {
  checkReconstitutedDose,
  vialDiscardDate,
  type MassUnit,
  type ReconstitutedDoseCheck,
} from "@engine/flags/reconstitution.ts";
import { InvalidDoseInputError } from "@engine/flags/units.ts";
import { PEPTIDES, PEPTIDE_STANDING_NOTICE, type Peptide, type PeptideId } from "@engine/peptides.ts";
import { PeptideRecalls } from "./PeptideRecalls";
import { PeptideUses } from "./PeptideUses";
import { Syringe } from "./Syringe";
import { hasMarketedProduct } from "@engine/peptideLabels.ts";
import type { Product } from "@/lib/model";
import { useCabinet } from "@/lib/store";

const PEPTIDE_LIST = Object.values(PEPTIDES) as Peptide[];
const STATUS_LINE: Record<Peptide["fdaStatus"], string> = {
  approved_product: "An FDA-approved product with this ingredient exists. A vial sold for research use is not that product.",
  category_2: "The FDA lists this in Category 2: substances that may present significant safety risks in compounding.",
  withdrawn_nomination_risk_text_published:
    "This was in the FDA's Category 2. The nomination was withdrawn, and the FDA still publishes the risk text below.",
  not_compoundable_statement: "The FDA says this cannot be used in compounding.",
  no_statement_found: "No FDA statement about this ingredient was found. That does not mean it is safe.",
};

function round(value: number): string {
  return Number(value.toFixed(3)).toString();
}

function Source({ url, date }: { url: string; date: string }) {
  return (
    <figcaption className="mt-1 text-sm text-ink-soft">
      <a className="underline" href={url} target="_blank" rel="noreferrer">
        FDA page
      </a>
      , dated {date}.
    </figcaption>
  );
}

function PeptideDetails({ peptideId, picker }: { peptideId: PeptideId; picker: React.ReactNode }) {
  const [vialAmount, setVialAmount] = useState("");
  const [vialUnit, setVialUnit] = useState<MassUnit>("mg");
  const [water, setWater] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState<MassUnit>("mcg");
  const [firstUse, setFirstUse] = useState("");

  const { items, add } = useCabinet();
  const peptide = PEPTIDES[peptideId];
  const cabinetId = `peptide:${peptideId}`;
  const inCabinet = items.some((item) => item.id === cabinetId);
  const marketed = hasMarketedProduct(peptideId);

  function addToCabinet() {
    const product: Product = {
      id: cabinetId,
      kind: "vial",
      displayName: peptide.name,
      maker: "Not matched to an FDA product record",
      ingredients: [],
      labelImages: [],
      recordUrl: peptide.fdaStatement?.sourceUrl ?? "https://www.fda.gov/drugs/human-drug-compounding",
      matchedBy: "name",
      peptideId,
    };
    add(product);
  }
  const approved = peptide.approvedProducts.map((product) => product.brand);

  const outcome = useMemo((): { check?: ReconstitutedDoseCheck; error?: string } => {
    const amount = Number(vialAmount);
    const diluentMl = Number(water);
    const doseValue = Number(dose);
    if (!(amount > 0) || !(diluentMl > 0) || !(doseValue > 0)) {
      return { error: "Enter the amount on the vial, the water you add and the dose your prescriber gave you, as numbers." };
    }
    try {
      return {
        check: checkReconstitutedDose({
          itemId: peptideId,
          vial: { vialAmount: amount, vialUnit, diluentMl },
          dose: { value: doseValue, unit: doseUnit },
        }),
      };
    } catch (error) {
      if (error instanceof InvalidDoseInputError) return { error: error.message };
      throw error;
    }
  }, [peptideId, vialAmount, vialUnit, water, dose, doseUnit]);

  const discard = useMemo(() => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(firstUse)) return null;
    try {
      return vialDiscardDate(firstUse);
    } catch {
      return null;
    }
  }, [firstUse]);

  return (
    <div className="pt-6">
      <h1 className="text-3xl font-medium narrow">Peptide check</h1>
      <p className="mt-3 facts max-w-[900px]">{PEPTIDE_STANDING_NOTICE}</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="grid gap-4 content-start">
          {picker}
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="grid gap-1 font-bold">
              Amount printed on the vial
              <input className="field font-normal" inputMode="decimal" value={vialAmount} onChange={(event) => setVialAmount(event.target.value)} />
            </label>
            <select aria-label="Vial unit" className="field font-normal w-auto" value={vialUnit} onChange={(event) => setVialUnit(event.target.value as MassUnit)}>
              <option value="mg">mg</option>
              <option value="mcg">mcg</option>
            </select>
          </div>
          <label className="grid gap-1 font-bold">
            Water you add, in mL
            <input className="field font-normal" inputMode="decimal" value={water} onChange={(event) => setWater(event.target.value)} />
          </label>
          <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
            <label className="grid gap-1 font-bold">
              Dose
              <input className="field font-normal" inputMode="decimal" value={dose} onChange={(event) => setDose(event.target.value)} />
            </label>
            <select aria-label="Dose unit" className="field font-normal w-auto" value={doseUnit} onChange={(event) => setDoseUnit(event.target.value as MassUnit)}>
              <option value="mcg">mcg</option>
              <option value="mg">mg</option>
            </select>
          </div>
          <label className="grid gap-1 font-bold">
            Day you first used this vial
            <input className="field font-normal" type="date" value={firstUse} onChange={(event) => setFirstUse(event.target.value)} />
          </label>
        </section>

        <section aria-live="polite" className="grid gap-4 content-start">
          <div className="facts">
            <h2 className="facts-title">{peptide.name}</h2>
            <div className="facts-row">
              <span>FDA-approved product</span>
              <span className="font-bold text-right">{approved.length > 0 ? approved.join(", ") : "None found"}</span>
            </div>
            <div className="facts-row">
              <span>WADA 2026 Prohibited List</span>
              <span className="font-bold text-right">
                {peptide.wada.named ? `Named${peptide.wada.class ? `, ${peptide.wada.class}` : ""}` : "Not named. That does not mean allowed."}
              </span>
            </div>
            <p className="mt-3">{STATUS_LINE[peptide.fdaStatus]}</p>
            {peptide.fdaStatement && (
              <figure className="mt-3">
                <blockquote className="quote">{peptide.fdaStatement.text}</blockquote>
                <Source url={peptide.fdaStatement.sourceUrl} date={peptide.fdaStatement.pageDate} />
              </figure>
            )}
          </div>

          {outcome.error && <p className="facts text-ink-soft">{outcome.error}</p>}
          {outcome.check && (
            <div className="facts">
              <h2 className="facts-head">Where the plunger stops</h2>
              <Syringe fillUnits={outcome.check.dose.u100Units} />
              <div className="facts-row">
                <span>Strength after mixing</span>
                <span className="font-bold">{round(outcome.check.reconstitution.concentrationMgPerMl)} mg per mL</span>
              </div>
              <div className="facts-row">
                <span>Your dose in millilitres</span>
                <span className="font-bold">{round(outcome.check.dose.mL)} mL</span>
              </div>
              <div className="facts-row">
                <span>On a U-100 insulin syringe</span>
                <span className="font-bold">{round(outcome.check.dose.u100Units)} units</span>
              </div>
              <p className="mt-2 text-sm text-ink-soft">{outcome.check.reconstitution.assumption}</p>
            </div>
          )}
          {outcome.check?.flags.map((flag) => (
            <div key={flag.title} className="facts" role="alert">
              <span className="px-2.5 py-1 text-sm font-semibold uppercase tracking-wide bg-[var(--stop)] text-[var(--on-bright)] rounded-[3px]">Stop</span>
              <h3 className="mt-2 text-lg font-semibold">{flag.title}</h3>
              <p className="mt-1">{flag.detail}</p>
            </div>
          ))}
          <PeptideUses peptideId={peptideId} />
          <div className="facts">
            {marketed ? (
              <p>
                To check {peptide.name} against your other medicines, add the FDA-approved product by name on the Add
                screen, so its full label is read.
              </p>
            ) : (
              <p>Add it to your cabinet so it is listed with your other medicines and on the printed list.</p>
            )}
            <div className="mt-3 flex flex-wrap gap-3">
              {marketed ? (
                <Link className="btn btn-quiet" href="/add">
                  Go to Add
                </Link>
              ) : (
                <button type="button" className="btn btn-quiet" onClick={addToCabinet} disabled={inCabinet}>
                  {inCabinet ? "In your cabinet" : "Add to my cabinet"}
                </button>
              )}
            </div>
          </div>
          <PeptideRecalls peptideId={peptideId} />
          {discard && (
            <div className="facts">
              <div className="facts-row">
                <span>Discard this vial by</span>
                <span className="font-bold">{discard.discardBy}</span>
              </div>
              <figure className="mt-2">
                <blockquote className="quote">{discard.source.text}</blockquote>
                <Source url={discard.source.sourceUrl} date={discard.source.pageDate} />
              </figure>
              <p className="mt-2 text-sm text-ink-soft">{discard.note}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

export function PeptideView() {
  const [peptideId, setPeptideId] = useState<PeptideId | "">("");
  const picker = (
    <label className="grid gap-1 font-bold">
      Peptide
      <select
        className="field font-normal"
        value={peptideId}
        onChange={(event) => setPeptideId(event.target.value as PeptideId | "")}
      >
        <option value="">Pick a peptide</option>
        {PEPTIDE_LIST.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </select>
    </label>
  );
  if (peptideId === "") {
    return (
      <div className="pt-6">
        <h1 className="text-3xl font-medium narrow">Peptide check</h1>
        <p className="mt-3 facts max-w-[900px]">{PEPTIDE_STANDING_NOTICE}</p>
        <div className="mt-8 max-w-[480px]">{picker}</div>
        <p className="mt-3 text-ink-soft">
          Pick one to see whether the FDA has approved it, what the FDA has published about it, recalls that name it, and
          the syringe math for your vial.
        </p>
      </div>
    );
  }
  return <PeptideDetails key={peptideId} peptideId={peptideId} picker={picker} />;
}
