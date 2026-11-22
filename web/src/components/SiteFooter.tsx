import Link from "next/link";

const LINKS = [
  { href: "/tested", label: "How we tested" },
  { href: "/print", label: "Pharmacist list" },
  { href: "https://github.com/Arnav66692/shelf-check", label: "Source code" },
] as const;

export function SiteFooter() {
  return (
    <footer className="w-full px-[var(--margin)] pt-16 pb-28 print:hidden">
      <div className="border-t border-dashed border-[var(--rule)] pt-8 grid gap-8 md:grid-cols-3">
        <p className="text-ink-soft max-w-[420px]">
          A safety check, not medical advice. Every warning quotes an official label. Show it to your pharmacist or
          doctor before you change what you take.
        </p>
        <ul className="grid gap-1">
          {LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="inline-block py-1 font-[family-name:var(--font-courier)] uppercase text-[20px] text-ink hover:text-accent"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
        <p className="font-[family-name:var(--font-space)] text-[12px] font-bold uppercase text-ink-soft">
          Poison Help{" "}
          <a href="tel:18002221222" className="inline-block py-2 text-accent underline">
            1-800-222-1222
          </a>
          <br />
          Collapse, seizure or trouble breathing: call 911
        </p>
      </div>
    </footer>
  );
}
