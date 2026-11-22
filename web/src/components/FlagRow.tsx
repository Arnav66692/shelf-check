import type { Flag, FlagQuote, Product, Severity } from "@/lib/model";

const SEVERITY_LABEL: Record<Severity, string> = {
  stop: "Stop",
  ask: "Ask first",
  info: "Note",
};

const SEVERITY_STYLE: Record<Severity, string> = {
  stop: "bg-[var(--stop)] text-white",
  ask: "bg-[var(--ask)] text-white",
  info: "bg-ink text-white",
};

const SECTION_NAMES: Record<string, string> = {
  drug_interactions: "Drug interactions",
  boxed_warning: "Boxed warning",
  warnings: "Warnings",
  warnings_and_cautions: "Warnings and precautions",
  contraindications: "Contraindications",
  do_not_use: "Do not use",
  ask_doctor: "Ask a doctor before use",
  ask_doctor_or_pharmacist: "Ask a doctor or pharmacist before use",
  when_using: "When using this product",
  dosage_and_administration: "Directions",
  indications_and_usage: "Uses",
  information_for_patients: "Information for patients",
  fda_recall: "FDA recall record",
  fda_statement: "FDA statement on this ingredient",
};

const QUOTES_SHOWN_FIRST = 2;

function escapeForPattern(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function Highlighted({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const pattern = new RegExp(`(${terms.map(escapeForPattern).join("|")})`, "gi");
  const lowered = new Set(terms.map((term) => term.toLowerCase()));
  return (
    <>
      {text.split(pattern).map((part, index) =>
        lowered.has(part.toLowerCase()) ? (
          <strong key={index} className="bg-[var(--ask-wash)] px-0.5">
            {part}
          </strong>
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </>
  );
}

function QuoteBlock({ quote, items, terms }: { quote: FlagQuote; items: readonly Product[]; terms: readonly string[] }) {
  const source = items.find((item) => item.id === quote.itemId);
  return (
    <figure className="mt-3">
      <blockquote className="quote">
        <Highlighted text={quote.excerpt} terms={terms} />
      </blockquote>
      <figcaption className="mt-1 text-sm text-ink-soft">
        {quote.section === "fda_recall" || quote.section === "fda_statement" ? "From the " : `From the label of ${source?.displayName ?? "this product"}, section `}
        {SECTION_NAMES[quote.section] ?? quote.section.replaceAll("_", " ")}.
      </figcaption>
    </figure>
  );
}

export function FlagRow({ flag, items }: { flag: Flag; items: readonly Product[] }) {
  const names = flag.itemIds
    .map((id) => items.find((item) => item.id === id)?.displayName)
    .filter((name): name is string => Boolean(name));
  const first = flag.quotes.slice(0, QUOTES_SHOWN_FIRST);
  const rest = flag.quotes.slice(QUOTES_SHOWN_FIRST);
  return (
    <li className="facts">
      <div className="flex flex-wrap items-center gap-3">
        <span className={`px-2.5 py-1 text-sm font-extrabold uppercase tracking-wide ${SEVERITY_STYLE[flag.severity]}`}>
          {SEVERITY_LABEL[flag.severity]}
        </span>
        <h3 className="text-lg font-extrabold leading-tight">{flag.title}</h3>
      </div>
      <p className="mt-2">{flag.explain}</p>
      {flag.type !== "interaction" && names.length > 0 && (
        <p className="mt-1 text-sm text-ink-soft">Involves {names.join(", ")}.</p>
      )}
      {first.map((quote) => (
        <QuoteBlock key={`${quote.itemId}:${quote.excerpt}`} quote={quote} items={items} terms={flag.highlight ?? []} />
      ))}
      {rest.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-bold underline">
            {rest.length} more label {rest.length === 1 ? "line" : "lines"}
          </summary>
          {rest.map((quote) => (
            <QuoteBlock key={`${quote.itemId}:${quote.excerpt}`} quote={quote} items={items} terms={flag.highlight ?? []} />
          ))}
        </details>
      )}
    </li>
  );
}
