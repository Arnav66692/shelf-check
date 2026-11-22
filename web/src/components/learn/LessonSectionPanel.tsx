import type { LessonSection } from "@/server/learn/types";
import { twoDigits } from "./copy";

export function SectionHeading({ id, position, title }: { id: string; position: number; title: string }) {
  return (
    <h2 id={id} className="facts-title flex items-baseline gap-3">
      <span className="font-medium text-[var(--accent)]">{twoDigits(position)}</span>
      <span>{title}</span>
    </h2>
  );
}

export function LessonSectionPanel({
  section,
  position,
  recordUrl,
}: {
  section: LessonSection;
  position: number;
  recordUrl: string;
}) {
  const headingId = `learn-${section.id}-title`;
  return (
    <section id={`learn-${section.id}`} aria-labelledby={headingId} className="facts">
      <SectionHeading id={headingId} position={position} title={section.title} />
      {section.quotes.length === 0 ? (
        <p className="mt-4 text-ink-soft">The label does not say.</p>
      ) : (
        section.quotes.map((quote) => (
          <figure key={`${quote.field}:${quote.text}`} className="mt-4">
            <blockquote className="quote">{quote.text}</blockquote>
            <figcaption className="mt-1 text-sm text-ink-soft">From the label, section {quote.sectionName}.</figcaption>
          </figure>
        ))
      )}
      <p className="mt-4 text-sm">
        <a className="underline font-bold" href={recordUrl} target="_blank" rel="noopener noreferrer">
          Read the full label
          <span className="sr-only">, opens DailyMed in a new tab</span>
        </a>
      </p>
    </section>
  );
}
