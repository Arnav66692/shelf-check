"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PersonSwitcher } from "./PersonSwitcher";

const MAIN_LINKS = [
  { href: "/", label: "Cabinet" },
  { href: "/add", label: "Add" },
  { href: "/symptoms", label: "Symptoms" },
  { href: "/profile", label: "About you" },
] as const;

const TOOL_LINKS = [
  { href: "/pills", label: "Pill finder" },
  { href: "/dose", label: "Dose check" },
  { href: "/peptides", label: "Peptides" },
] as const;

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`pb-1 border-b-[3px] ${active ? "border-ink" : "border-transparent hover:border-hair"}`}
    >
      {label}
    </Link>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const inTools = TOOL_LINKS.some((link) => link.href === pathname);
  return (
    <header className="w-full max-w-[1180px] mx-auto px-4 sm:px-8 pt-6 pb-4 flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
      <Link href="/" className="wordmark text-[2rem] leading-none">
        Shelf Check
      </Link>
      <nav aria-label="Main" className="flex flex-wrap items-end gap-x-6 gap-y-2 font-bold">
        {MAIN_LINKS.map((link) => (
          <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
        ))}
        <details key={pathname} className="relative">
          <summary
            className={`cursor-pointer list-none pb-1 border-b-[3px] ${inTools ? "border-ink" : "border-transparent hover:border-hair"}`}
          >
            More tools
          </summary>
          <div className="absolute right-0 z-20 mt-2 grid min-w-[190px] gap-1 border-2 border-ink bg-[var(--panel)] p-3">
            {TOOL_LINKS.map((link) => (
              <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
            ))}
          </div>
        </details>
      </nav>
      <div className="w-full print:hidden">
        <PersonSwitcher />
      </div>
    </header>
  );
}
