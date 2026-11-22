"use client";

import Link from "next/link";
import { useState } from "react";
import {
  checkReconstitutedDose,
  vialDiscardDate,
  type MassUnit,
  UnverifiedDrawError,
  type ReconstitutedDoseCheck,
  type VialPresentation,
} from "@engine/flags/reconstitution.ts";
import { InvalidDoseInputError } from "@engine/flags/units.ts";
import type { Flag } from "@engine/types.ts";
import { PEPTIDES, PEPTIDE_STANDING_NOTICE, type Peptide, type PeptideId } from "@engine/peptides.ts";
import {
  EGRIFTA_SV_LABEL,
  EGRIFTA_WR_LABEL,
  hasMarketedProduct,
  PEPTIDE_LABELS,
  type ProductLabel,
} from "@engine/peptideLabels.ts";
import { PeptideRecalls } from "./PeptideRecalls";
import { PeptideUses } from "./PeptideUses";
import { formatAmount, Notice, parseAmount, planDraw, SeverityBadge, Syringe, type Draw } from "./Syringe";
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
const MCG_PER_MG = 1000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const USE_LABEL_DATE = "Use the date on your label or ask your pharmacist.";
const OTHER_VIAL_ID = "other_vial";

type Presentation =
  | { readonly id: string; readonly label: string; readonly kind: "ready"; readonly note: string }
  | {
      readonly id: VialPresentation;
      readonly label: string;
      readonly kind: "kit";
      readonly brand: string;
      readonly vialMg: number;
      readonly diluentMl: number;
      readonly diluent: string;
      readonly diluentName: string;
      readonly labelDoseMg: number;
      readonly mixQuote: string;
      readonly doseQuote: string;
      readonly storage?: string;
    }
  | { readonly id: typeof OTHER_VIAL_ID; readonly label: string; readonly kind: "vial" };

const OTHER_VIAL: Presentation = {
  id: OTHER_VIAL_ID,
  label: "A vial from a compounding pharmacy or another seller",
  kind: "vial",
};

const PRESENTATIONS: Partial<Record<PeptideId, readonly Presentation[]>> = {
  semaglutide: [
    {
      id: "sema_pen",
      label: "Ozempic or Wegovy pen",
      kind: "ready",
      note: "These pens come ready to use. You set the dose on the pen, not with syringe marks. Follow the pen instructions and your pharmacist.",
    },
    {
      id: "sema_tablet",
      label: "Rybelsus, Ozempic or Wegovy tablets",
      kind: "ready",
      note: "These are tablets, so no mixing or syringe applies. The label says Rybelsus and Ozempic tablets are not swapped mg for mg. Take them as your prescriber and pharmacist told you.",
    },
    OTHER_VIAL,
  ],
  tirzepatide: [
    {
      id: "tirz_pen",
      label: "Mounjaro or Zepbound pen or KwikPen",
      kind: "ready",
      note: "These pens come ready to use. You set or get the dose from the pen, not from syringe marks. Follow the pen instructions and your pharmacist.",
    },
    {
      id: "tirz_vial",
      label: "Mounjaro or Zepbound single-dose vial",
      kind: "ready",
      note: "A single-dose vial holds one dose that is already mixed. It is used once and the rest is thrown away. Follow the vial instructions and your pharmacist.",
    },
    OTHER_VIAL,
  ],
  tesamorelin: [
    {
      id: "egrifta-wr",
      label: "Egrifta WR kit, 11.6 mg vial",
      kind: "kit",
      brand: "Egrifta WR",
      vialMg: 11.6,
      diluentMl: 1.3,
      diluent: "supplied-bacteriostatic-water-for-injection",
      diluentName: "the bacteriostatic water that came in the kit",
      labelDoseMg: 1.28,
      mixQuote: "Reconstitute 1 vial of EGRIFTA WR lyophilized powder with 1.3 mL of diluent (8 mg per mL).",
      doseQuote: "One dose of EGRIFTA WR is 1.28 mg in 0.16 mL of the reconstituted solution.",
      storage: "kept at room temperature, 20°C to 25°C (68°F to 77°F), and never frozen, as the label says",
    },
    {
      id: "egrifta-sv",
      label: "Egrifta SV kit, 2 mg vial",
      kind: "kit",
      brand: "Egrifta SV",
      vialMg: 2,
      diluentMl: 0.5,
      diluent: "supplied-sterile-water-for-injection",
      diluentName: "the sterile water that came in the kit",
      labelDoseMg: 1.4,
      mixQuote: "Reconstitute 1 vial of EGRIFTA SV lyophilized powder with 0.5 mL of diluent (2 mg per 0.5 mL).",
      doseQuote: "The dose of EGRIFTA SV is 1.4 mg (0.35 mL of the reconstituted solution) injected subcutaneously once daily.",
    },
    OTHER_VIAL,
  ],
  bremelanotide: [
    {
      id: "vyleesi",
      label: "Vyleesi autoinjector",
      kind: "ready",
      note: "The autoinjector comes ready to use with one fixed dose. No mixing or syringe applies. Follow the autoinjector instructions and your pharmacist.",
    },
    OTHER_VIAL,
  ],
};

function labelDoseUnit(peptideId: PeptideId): MassUnit {
  const entry = PEPTIDE_LABELS[peptideId];
  if (!entry.approved) return "mg";
  const text = entry.products.flatMap((product) => product.dosing).join(" ");
  const match = /\b(mcg|mg)\b/.exec(text);
  return match?.[1] === "mcg" ? "mcg" : "mg";
}

function kitLabel(id: VialPresentation): ProductLabel {
  return id === "egrifta-wr" ? EGRIFTA_WR_LABEL : EGRIFTA_SV_LABEL;
}

function toMg(value: number, unit: MassUnit): number {
  return unit === "mg" ? value : value / MCG_PER_MG;
}

function Source({ url, date, label = "FDA page" }: { url: string; date: string; label?: string }) {
  return (
    <figcaption className="mt-1 text-sm text-ink-soft">
      <a className="underline" href={url} target="_blank" rel="noreferrer">
        {label}
      </a>
      , dated {date}.
    </figcaption>
  );
}

function AmountField({
  label,
  value,
  onChange,
  unit,
  onUnit,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  unit?: MassUnit;
  onUnit?: (next: MassUnit) => void;
  placeholder?: string;
}) {
  const input = (
    <label className="grid gap-1 font-bold">
      {label}
      <input className="field font-normal" inputMode="decimal" placeholder={placeholder} value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
  if (unit === undefined || onUnit === undefined) return input;
  return (
    <div className="grid grid-cols-[1fr_auto] gap-3 items-end">
      {input}
      <select aria-label={`${label} unit`} className="field font-normal w-auto" value={unit} onChange={(event) => onUnit(event.target.value as MassUnit)}>
        <option value="mg">mg</option>
        <option value="mcg">mcg</option>
      </select>
    </div>
  );
}

type DrawPlan =
  | { readonly kind: "waiting"; readonly message: string }
  | { readonly kind: "invalid"; readonly message: string }
  | { readonly kind: "over_vial"; readonly doseMg: number; readonly vialMg: number }
  | { readonly kind: "draw"; readonly doseMg: number; readonly mgPerMl: number; readonly draw: Draw };

function readMass(text: string, unit: MassUnit, field: string): { mg?: number; error?: string } {
  const parsed = parseAmount(text, field);
  if ("error" in parsed) return { error: parsed.error };
  if ("value" in parsed) return { mg: toMg(parsed.value, unit) };
  return {};
}

function plan(doseMg: number, vialMg: number, mgPerMl: number): DrawPlan {
  if (doseMg > vialMg) return { kind: "over_vial", doseMg, vialMg };
  return { kind: "draw", doseMg, mgPerMl, draw: planDraw(doseMg / mgPerMl) };
}

function DrawResult({ result }: { result: DrawPlan }) {
  if (result.kind === "waiting") return <p className="facts text-ink-soft">{result.message}</p>;
  if (result.kind === "invalid") {
    return (
      <p className="facts" role="alert">
        {result.message}
      </p>
    );
  }
  if (result.kind === "over_vial") {
    return (
      <Notice severity="stop" title="This dose is more than the whole vial">
        <p>
          The dose is {formatAmount(result.doseMg)} mg and the whole vial holds {formatAmount(result.vialMg)} mg, so no
          syringe mark is shown. A number this large often means mg and mcg were mixed up. Do not inject until the
          pharmacist or the prescriber confirms the amount.
        </p>
      </Notice>
    );
  }
  return (
    <div className="facts">
      <h2 className="facts-head">Where the plunger stops</h2>
      <Syringe draw={result.draw} />
      <div className="facts-row">
        <span>Strength after mixing</span>
        <span className="font-bold">{formatAmount(result.mgPerMl)} mg per mL</span>
      </div>
      <div className="facts-row">
        <span>Your dose</span>
        <span className="font-bold">
          {formatAmount(result.doseMg)} mg, which is {formatAmount(result.draw.mL)} mL
        </span>
      </div>
    </div>
  );
}

function Confirm({ label, checked, onChange }: { label: string; checked: boolean; onChange: (next: boolean) => void }) {
  return (
    <label className="flex items-start gap-3">
      <input type="checkbox" className="mt-1 h-5 w-5 accent-[var(--leaf)]" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function safeDiscardDate(mixed: string, presentation: VialPresentation, storedAsLabeled: boolean | undefined) {
  if (!ISO_DATE.test(mixed)) return null;
  try {
    return vialDiscardDate(mixed, presentation, { event: "mixing", storedAsLabeled });
  } catch {
    return null;
  }
}

function DiscardDate({ kit }: { kit: Extract<Presentation, { kind: "kit" }> }) {
  const [mixed, setMixed] = useState("");
  const [storedAsLabeled, setStoredAsLabeled] = useState(false);
  const discard = safeDiscardDate(mixed, kit.id, kit.storage ? storedAsLabeled : undefined);
  return (
    <div className="facts">
      <h2 className="facts-head">When to throw it away</h2>
      <div className="mt-2 grid gap-3">
        <label className="grid gap-1 font-bold">
          Day you mixed this vial
          <input className="field font-normal" type="date" value={mixed} onChange={(event) => setMixed(event.target.value)} />
        </label>
        {kit.storage && <Confirm label={`Since mixing, the vial was ${kit.storage}.`} checked={storedAsLabeled} onChange={setStoredAsLabeled} />}
      </div>
      {discard?.timing === "date" && discard.discardBy && (
        <div className="facts-row mt-2">
          <span>Throw away what is left on</span>
          <span className="font-bold">{discard.discardBy}</span>
        </div>
      )}
      {discard?.timing === "immediate" && (
        <p className="mt-2 font-bold">Use it right after mixing and throw away what is left. Do not keep it for another day.</p>
      )}
      {discard === null && <p className="mt-2 text-ink-soft">{USE_LABEL_DATE}</p>}
      {discard && (
        <figure className="mt-2">
          <blockquote className="quote">{discard.source.text}</blockquote>
          <Source url={discard.source.sourceUrl} date={discard.source.pageDate} label="DailyMed label" />
        </figure>
      )}
      {discard?.timing === "date" && (
        <p className="mt-2 text-sm text-ink-soft">If the pharmacy or the prescriber gives a shorter time, follow the shorter time.</p>
      )}
    </div>
  );
}

type KitOutcome =
  | { readonly kind: "waiting"; readonly message: string }
  | { readonly kind: "blocked"; readonly message: string; readonly flags: readonly Flag[] }
  | { readonly kind: "draw"; readonly check: ReconstitutedDoseCheck; readonly draw: Draw };

function kitOutcome(kit: Extract<Presentation, { kind: "kit" }>, doseMg: number, mixedAsLabeled: boolean): KitOutcome {
  try {
    const check = checkReconstitutedDose({
      itemId: kit.id,
      vial: {
        presentation: kit.id,
        vialAmount: kit.vialMg,
        vialUnit: "mg",
        diluentMl: kit.diluentMl,
        diluent: mixedAsLabeled ? kit.diluent : undefined,
      },
      dose: { value: doseMg, unit: "mg" },
    });
    if (check === undefined) {
      return {
        kind: "waiting",
        message: `Tick the box to confirm you mixed the vial with ${kit.diluentMl} mL of ${kit.diluentName}. Without that, the strength after mixing is not known and no mark is shown.`,
      };
    }
    return { kind: "draw", check, draw: planDraw(check.dose.mL) };
  } catch (caught) {
    if (!(caught instanceof InvalidDoseInputError)) throw caught;
    const flags = caught instanceof UnverifiedDrawError ? caught.flags : [];
    return { kind: "blocked", message: caught.message, flags };
  }
}

function KitResult({ outcome }: { outcome: KitOutcome }) {
  if (outcome.kind === "waiting") return <p className="facts text-ink-soft">{outcome.message}</p>;
  if (outcome.kind === "blocked") {
    if (outcome.flags.length === 0) {
      return (
        <Notice severity="stop" title="No syringe mark for this dose">
          <p>{outcome.message} No syringe mark is shown.</p>
        </Notice>
      );
    }
    return (
      <>
        {outcome.flags.map((flag) => (
          <div key={flag.title} className="facts" role="alert">
            <SeverityBadge severity={flag.severity} />
            <h3 className="mt-2 text-lg font-semibold">{flag.title}</h3>
            <p className="mt-1">{flag.detail} No syringe mark is shown.</p>
            {flag.source && (
              <figure className="mt-2">
                <blockquote className="quote">{flag.source.text}</blockquote>
                <Source url={flag.source.sourceUrl} date={flag.source.pageDate} label="DailyMed label" />
              </figure>
            )}
          </div>
        ))}
      </>
    );
  }
  return (
    <div className="facts">
      <h2 className="facts-head">Where the plunger stops</h2>
      <Syringe draw={outcome.draw} />
      <div className="facts-row">
        <span>Strength after mixing, from the label</span>
        <span className="font-bold">{formatAmount(outcome.check.reconstitution.concentrationMgPerMl)} mg per mL</span>
      </div>
      <div className="facts-row">
        <span>Your dose</span>
        <span className="font-bold">
          {formatAmount(outcome.check.dose.mg)} mg, which is {formatAmount(outcome.check.dose.mL)} mL
        </span>
      </div>
    </div>
  );
}

function KitCalculator({ kit, defaultUnit }: { kit: Extract<Presentation, { kind: "kit" }>; defaultUnit: MassUnit }) {
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState<MassUnit>(defaultUnit);
  const [mixedAsLabeled, setMixedAsLabeled] = useState(false);
  const read = readMass(dose, doseUnit, "Dose");
  const outcome: KitOutcome = read.error
    ? { kind: "blocked", message: read.error, flags: [] }
    : read.mg === undefined
      ? { kind: "waiting", message: "Type the dose your prescriber gave you. The syringe appears here." }
      : kitOutcome(kit, read.mg, mixedAsLabeled);

  return (
    <>
      <div className="facts">
        <h2 className="facts-head">How the {kit.brand} label says to mix and dose</h2>
        <figure className="mt-2">
          <blockquote className="quote">
            <p>{kit.mixQuote}</p>
            <p>{kit.doseQuote}</p>
          </blockquote>
          <Source url={kitLabel(kit.id).url} date={kitLabel(kit.id).labelDate} label="DailyMed label" />
        </figure>
        <div className="mt-3 grid gap-3">
          <Confirm
            label={`I mixed this vial with ${kit.diluentMl} mL of ${kit.diluentName}, as the label says.`}
            checked={mixedAsLabeled}
            onChange={setMixedAsLabeled}
          />
          <AmountField label="Dose your prescriber gave you" value={dose} onChange={setDose} unit={doseUnit} onUnit={setDoseUnit} placeholder={`For example ${kit.labelDoseMg}`} />
        </div>
      </div>
      <KitResult outcome={outcome} />
      <DiscardDate kit={kit} />
    </>
  );
}

function VialCalculator({ defaultUnit }: { defaultUnit: MassUnit }) {
  const [vialAmount, setVialAmount] = useState("");
  const [vialUnit, setVialUnit] = useState<MassUnit>("mg");
  const [strength, setStrength] = useState("");
  const [dose, setDose] = useState("");
  const [doseUnit, setDoseUnit] = useState<MassUnit>(defaultUnit);

  const vial = readMass(vialAmount, vialUnit, "Amount in the whole vial");
  const doseRead = readMass(dose, doseUnit, "Dose");
  const strengthRead = parseAmount(strength, "Strength after mixing");
  const error = vial.error ?? ("error" in strengthRead ? strengthRead.error : undefined) ?? doseRead.error;
  let result: DrawPlan;
  if (error) result = { kind: "invalid", message: error };
  else if (vial.mg === undefined || doseRead.mg === undefined) {
    result = { kind: "waiting", message: "Type the amount in the whole vial, the strength printed on its label and the dose your prescriber gave you." };
  } else if (doseRead.mg > vial.mg) result = { kind: "over_vial", doseMg: doseRead.mg, vialMg: vial.mg };
  else if (!("value" in strengthRead)) {
    result = {
      kind: "waiting",
      message:
        "Type the strength after mixing, in mg per mL, from the vial label or the pharmacy sheet. If it is not printed, ask the pharmacy that made it. This page does not work it out from the water added, because the powder can change the volume.",
    };
  } else result = plan(doseRead.mg, vial.mg, strengthRead.value);

  return (
    <>
      <div className="facts grid gap-3">
        <AmountField label="Amount in the whole vial" value={vialAmount} onChange={setVialAmount} unit={vialUnit} onUnit={setVialUnit} />
        <AmountField label="Strength after mixing, in mg per mL, as printed on the label" value={strength} onChange={setStrength} />
        <AmountField label="Dose your prescriber gave you" value={dose} onChange={setDose} unit={doseUnit} onUnit={setDoseUnit} />
      </div>
      <DrawResult result={result} />
      <div className="facts">
        <h2 className="facts-head">When to throw it away</h2>
        <p className="mt-2">{USE_LABEL_DATE}</p>
      </div>
    </>
  );
}

function NoApprovedDose({ peptide }: { peptide: Peptide }) {
  return (
    <>
      <Notice severity="ask" title={`No syringe mark for ${peptide.name}`}>
        <p>
          The FDA has not approved a dose of {peptide.name} that this app can quote, so this page does not show a draw
          target or a syringe mark. Ask the dispensing pharmacist which liquid to mix it with and to confirm the mark
          before injecting.
        </p>
      </Notice>
      <div className="facts">
        <h2 className="facts-head">When to throw it away</h2>
        <p className="mt-2">{USE_LABEL_DATE}</p>
      </div>
    </>
  );
}

function SyringeSection({ peptide }: { peptide: Peptide }) {
  const presentations = PRESENTATIONS[peptide.id];
  const [presentationId, setPresentationId] = useState("");
  if (presentations === undefined) return <NoApprovedDose peptide={peptide} />;
  const chosen = presentations.find((item) => item.id === presentationId);
  const defaultUnit = labelDoseUnit(peptide.id);
  return (
    <>
      <div className="facts">
        <label className="grid gap-1 font-bold">
          Which product do you have?
          <select className="field font-normal" value={presentationId} onChange={(event) => setPresentationId(event.target.value)}>
            <option value="">Pick one</option>
            {presentations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        {chosen === undefined && <p className="mt-2 text-ink-soft">Syringe math only applies to some products, so pick yours first.</p>}
      </div>
      {chosen?.kind === "ready" && (
        <>
          <Notice severity="info" title="Ready to use, no syringe math">
            <p>{chosen.note}</p>
          </Notice>
          <div className="facts">
            <h2 className="facts-head">When to throw it away</h2>
            <p className="mt-2">{USE_LABEL_DATE}</p>
          </div>
        </>
      )}
      {chosen?.kind === "kit" && <KitCalculator key={chosen.id} kit={chosen} defaultUnit={defaultUnit} />}
      {chosen?.kind === "vial" && <VialCalculator key={chosen.id} defaultUnit={defaultUnit} />}
    </>
  );
}

function PeptideDetails({ peptideId, picker }: { peptideId: PeptideId; picker: React.ReactNode }) {
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

  return (
    <div className="pt-6">
      <h1 className="text-3xl font-medium narrow">Peptide check</h1>
      <p className="mt-3 facts max-w-[900px]">{PEPTIDE_STANDING_NOTICE}</p>

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="grid gap-4 content-start">
          {picker}
          <SyringeSection peptide={peptide} />
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
          the syringe math for products where it applies.
        </p>
      </div>
    );
  }
  return <PeptideDetails key={peptideId} peptideId={peptideId} picker={picker} />;
}
