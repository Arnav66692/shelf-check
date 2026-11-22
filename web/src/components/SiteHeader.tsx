"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  { href: "/print", label: "List for your pharmacist" },
  { href: "/tested", label: "How we tested" },
] as const;

export function Mark({ size = 34 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 32" width={size} height={(size * 32) / 48} aria-hidden="true">
      <g fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M4 22c4-11 12-15 20-10s14 1 20-8" />
        <path d="M4 28c5-8 12-11 19-7s14 1 21-6" opacity="0.75" />
        <path d="M10 10a9 9 0 0 1 12-4" />
        <path d="M12 15a6 6 0 0 1 7-3" />
      </g>
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [more, setMore] = useState({ open: false, path: pathname });
  const open = more.open && more.path === pathname;
  const box = useRef<HTMLDivElement>(null);
  const inTools = TOOL_LINKS.some((link) => link.href === pathname);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMore((current) => ({ ...current, open: false }));
    }
    function onClick(event: MouseEvent) {
      if (box.current && !box.current.contains(event.target as Node)) setMore((current) => ({ ...current, open: false }));
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <header className="relative z-30 print:hidden">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-[var(--margin)] pt-[var(--margin)]">
        <Link href="/" className="flex items-center gap-2 text-ink">
          <Mark />
          <span className="wordmark text-[15px]">Shelf Check</span>
        </Link>
        <nav aria-label="Main" className="flex flex-wrap items-center gap-x-1 gap-y-1 font-[family-name:var(--font-space)] text-[12px] font-bold uppercase">
          {MAIN_LINKS.map((link, index) => (
            <span key={link.href} className="flex items-center">
              {index > 0 && <span className="px-2 text-muted" aria-hidden="true">·</span>}
              <Link
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`py-1 hover:text-accent ${pathname === link.href ? "text-accent" : "text-ink"}`}
              >
                {link.label}
              </Link>
            </span>
          ))}
          <span className="px-2 text-muted" aria-hidden="true">·</span>
          <div ref={box} className="relative">
            <button
              type="button"
              aria-expanded={open}
              aria-controls="more-tools"
              onClick={() => setMore({ open: !open, path: pathname })}
              className={`py-1 uppercase hover:text-accent ${inTools ? "text-accent" : "text-ink"}`}
            >
              More
            </button>
            {open && (
              <div id="more-tools" className="facts absolute right-0 mt-3 min-w-[240px] grid gap-1 p-3 z-40">
                {TOOL_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={pathname === link.href ? "page" : undefined}
                    className={`block rounded-full px-3 py-2 hover:bg-[var(--faint)] ${pathname === link.href ? "text-accent" : "text-ink"}`}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            )}
          </div>
        </nav>
      </div>
      <div className="px-[var(--margin)] mt-4">
        <PersonSwitcher />
      </div>
    </header>
  );
}
