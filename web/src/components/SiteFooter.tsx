import Link from "next/link";

const COLUMNS = [
  {
    title: "Check",
    links: [
      { href: "/", label: "Your cabinet" },
      { href: "/add", label: "Add a medicine" },
      { href: "/symptoms", label: "How you feel" },
      { href: "/profile", label: "About you" },
    ],
  },
  {
    title: "Tools",
    links: [
      { href: "/pills", label: "Pill finder" },
      { href: "/dose", label: "Dose check" },
      { href: "/peptides", label: "Peptides" },
      { href: "/print", label: "List for your pharmacist" },
    ],
  },
  {
    title: "Proof",
    links: [
      { href: "/tested", label: "How we tested it" },
      { href: "https://github.com/Arnav66692/shelf-check", label: "Source code" },
    ],
  },
] as const;

export function SiteFooter() {
  return (
    <footer className="w-full px-[var(--space-1)] pt-24 pb-10 print:hidden">
      <div className="border-t border-b border-[var(--rule)]">
        <Link
          href="/start"
          className="block py-10 text-center italic uppercase leading-[0.88] tracking-[-0.04em] text-[var(--fs-band)] font-[100] hover:font-[900] transition-[font-weight] duration-[400ms]"
        >
          Start your cabinet
        </Link>
      </div>
      <p className="mx-auto mt-6 max-w-[820px] text-center text-[length:var(--fs-body-xl)] text-ink-soft">
        A safety check, not medical advice. Every warning quotes an official label. Show it to your pharmacist or doctor
        before you change what you take.
      </p>
      <div className="mt-20 grid gap-10 md:grid-cols-[1fr_1fr_1fr_15%]">
        {COLUMNS.map((column) => (
          <div key={column.title}>
            <h2 className="text-[24px] italic font-[300] uppercase text-muted mb-6 md:mb-12">{column.title}</h2>
            <ul className="grid gap-4 text-[14px]">
              {column.links.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className="text-ink-soft hover:underline">
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ))}
        <div>
          <h2 className="text-[24px] italic font-[300] uppercase text-muted mb-6 md:mb-12">Help</h2>
          <p className="text-[14px] text-ink-soft">
            Poison Help <a href="tel:18002221222" className="underline">1-800-222-1222</a>. Collapse, seizure or trouble
            breathing: call 911.
          </p>
        </div>
      </div>
      <div className="mt-16 w-[80%] border-t border-[var(--rule)]" />
      <div className="mt-6 flex flex-wrap items-center gap-6 text-[14px] text-ink-soft">
        <span className="italic font-[900] uppercase tracking-[-0.04em] text-ink">Shelf Check</span>
        <span>Built for EvoHacks 2, November 2026. Data from the FDA, NIH and NLM.</span>
      </div>
    </footer>
  );
}
