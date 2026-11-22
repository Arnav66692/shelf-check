"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PersonSwitcher } from "./PersonSwitcher";

const LINKS = [
  { href: "/", label: "Cabinet" },
  { href: "/add", label: "Add" },
  { href: "/symptoms", label: "Symptoms" },
  { href: "/peptides", label: "Peptides" },
  { href: "/dose", label: "Dose check" },
  { href: "/profile", label: "About you" },
  { href: "/tested", label: "How we tested" },
] as const;

export function SiteHeader() {
  const pathname = usePathname();
  return (
    <header className="w-full max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 pb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <Link href="/" className="wordmark text-[2rem] leading-none">
        Shelf Check
      </Link>
      <nav aria-label="Main" className="flex flex-wrap gap-x-6 gap-y-2 font-bold">
        {LINKS.map((link) => {
          const active = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? "page" : undefined}
              className={`pb-1 border-b-[3px] ${active ? "border-ink" : "border-transparent hover:border-hair"}`}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
      <div className="w-full print:hidden">
        <PersonSwitcher />
      </div>
    </header>
  );
}
