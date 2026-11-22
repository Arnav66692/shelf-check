"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCabinet } from "@/lib/store";
import { PersonSwitcher } from "./PersonSwitcher";
import { Swash } from "./Swash";

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

const GLASS =
  "border border-[var(--rule)] bg-[rgba(12,22,50,0.62)] backdrop-blur-[14px] rounded-[6px] shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]";

function NavLink({ href, label, active }: { href: string; label: string; active: boolean }) {
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className={`px-2.5 py-1.5 rounded-[4px] transition-colors ${active ? "text-leaf" : "text-ink-soft hover:text-ink"}`}
    >
      {label}
    </Link>
  );
}

function SeedIcon() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
      <g stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line key={angle} x1="12" y1="12" x2="12" y2="4" transform={`rotate(${angle} 12 12)`} />
        ))}
      </g>
      <circle cx="12" cy="12" r="2.2" fill="currentColor" />
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { items } = useCabinet();
  const inTools = TOOL_LINKS.some((link) => link.href === pathname);
  return (
    <header className="w-full max-w-[1180px] mx-auto px-4 sm:px-8 pt-4 pb-3 relative z-20">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href="/" className={`${GLASS} flex items-center gap-2.5 pl-1.5 pr-3.5 py-1.5`}>
          <span className="grid place-items-center w-8 h-8 rounded-[4px] bg-leaf text-[var(--on-bright)]">
            <SeedIcon />
          </span>
          <span className="wordmark">
            <Swash text="Shelf Check" />
          </span>
        </Link>
        <nav
          aria-label="Main"
          className={`${GLASS} order-3 w-full md:order-none md:w-auto flex flex-wrap items-center gap-x-1 gap-y-1 px-2 py-1.5 text-[0.82rem] uppercase tracking-[0.12em] border-l-2 border-r-2 border-l-leaf border-r-leaf`}
        >
          {MAIN_LINKS.map((link) => (
            <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
          ))}
          <details key={pathname} className="relative">
            <summary
              className={`cursor-pointer list-none px-2.5 py-1.5 ${inTools ? "text-leaf" : "text-ink-soft hover:text-ink"}`}
            >
              More tools
            </summary>
            <div className={`${GLASS} absolute right-0 z-30 mt-2 grid min-w-[190px] gap-1 p-2 bg-[var(--panel)]`}>
              {TOOL_LINKS.map((link) => (
                <NavLink key={link.href} href={link.href} label={link.label} active={pathname === link.href} />
              ))}
            </div>
          </details>
        </nav>
        <Link
          href="/"
          className={`${GLASS} flex items-center gap-2.5 pl-3.5 pr-1.5 py-1.5 text-[0.82rem] uppercase tracking-[0.12em] border-r-2 border-r-leaf`}
        >
          Cabinet
          <span className="min-w-7 px-1.5 py-0.5 rounded-[3px] bg-leaf text-[var(--on-bright)] text-center text-[0.78rem] font-semibold tabular-nums">
            {items.length}
          </span>
          <span className="sr-only">items</span>
        </Link>
      </div>
      <div className="mt-3 print:hidden">
        <PersonSwitcher />
      </div>
    </header>
  );
}
