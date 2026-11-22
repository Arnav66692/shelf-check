"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAIN_LINKS = [
  { href: "/", label: "Cabinet" },
  { href: "/add", label: "Add" },
  { href: "/symptoms", label: "Symptoms" },
  { href: "/learn", label: "Learn" },
  { href: "/care", label: "Find care" },
] as const;

const TOOL_LINKS = [
  { href: "/profile", label: "About you" },
  { href: "/pills", label: "Pill finder" },
  { href: "/dose", label: "Dose check" },
  { href: "/peptides", label: "Peptides" },
  { href: "/print", label: "List for your pharmacist" },
  { href: "/tested", label: "How we tested" },
] as const;

export function Mark({ size = 40 }: { size?: number }) {
  return (
    <svg viewBox="0 0 48 40" width={size} height={(size * 40) / 48} aria-hidden="true">
      <g transform="rotate(38 17 25)">
        <rect x="7" y="15" width="20" height="22" rx="3.5" fill="#ffffff" />
        <rect x="7" y="22" width="20" height="8" fill="var(--paper)" opacity="0.85" />
        <rect x="7" y="23.6" width="20" height="1.2" fill="#ffffff" opacity="0.5" />
        <rect x="10.5" y="10" width="13" height="6" rx="1.2" fill="#ffffff" />
        <rect x="9.5" y="8.6" width="15" height="2.4" rx="1.2" fill="none" stroke="#ffffff" strokeWidth="1.4" />
      </g>
      <g transform="rotate(-28 35 8)">
        <rect x="30" y="5.6" width="11" height="5" rx="2.5" fill="var(--stop)" />
        <rect x="35.5" y="5.6" width="5.5" height="5" rx="2.5" fill="#ffffff" opacity="0.28" />
      </g>
      <g transform="rotate(22 41 19)">
        <rect x="36" y="16.6" width="11" height="5" rx="2.5" fill="var(--accent)" />
        <rect x="41.5" y="16.6" width="5.5" height="5" rx="2.5" fill="#ffffff" opacity="0.28" />
      </g>
    </svg>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const [more, setMore] = useState({ open: false, path: pathname });
  const open = more.open && more.path === pathname;
  const box = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const inTools = TOOL_LINKS.some((link) => link.href === pathname);

  useEffect(() => {
    if (!open) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMore((current) => ({ ...current, open: false }));
    }
    function onClick(event: MouseEvent) {
      const target = event.target as Node;
      if (box.current?.contains(target) || panel.current?.contains(target)) return;
      setMore((current) => ({ ...current, open: false }));
    }
    window.addEventListener("keydown", onKey);
    window.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("click", onClick);
    };
  }, [open]);

  return (
    <header className="fixed z-40 inset-x-0 top-0 print:hidden bg-[var(--paper)] border-b border-solid border-[var(--hair)] pb-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-[var(--margin)] pt-[var(--margin)]">
        <Link href="/" className="flex items-center gap-2 py-2 -my-2 text-ink">
          <Mark />
          <span className="wordmark text-[15px]">Shelf Check</span>
        </Link>
        <nav aria-label="Main" className="flex flex-nowrap items-center gap-x-1 max-w-full overflow-x-auto [scrollbar-width:none] max-sm:-mx-[var(--margin)] max-sm:px-[var(--margin)] font-[family-name:var(--font-display)] text-[12px] font-medium tracking-[0.12em] uppercase whitespace-nowrap">
          {MAIN_LINKS.map((link, index) => (
            <span key={link.href} className="flex items-center">
              {index > 0 && <span className="px-2 text-muted" aria-hidden="true">·</span>}
              <Link
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`py-1 px-1 hover:text-accent ${pathname === link.href ? "text-accent" : "text-ink"}`}
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
          </div>
        </nav>
      </div>
      {open &&
        createPortal(
          <div
            id="more-tools"
            ref={panel}
            style={{ position: "fixed" }}
            className="facts !bg-[var(--panel)] !px-5 !border !border-[var(--hair)] fixed right-[var(--margin)] top-[calc(var(--margin)+84px)] sm:top-[calc(var(--margin)+40px)] w-[260px] grid gap-1 p-3 z-50"
          >
            {TOOL_LINKS.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`block rounded-full px-3 py-2 font-[family-name:var(--font-display)] text-[12px] font-medium tracking-[0.12em] uppercase hover:bg-[var(--faint)] ${pathname === link.href ? "text-accent" : "text-ink"}`}
              >
                {link.label}
              </Link>
            ))}
          </div>,
          document.body,
        )}
    </header>
  );
}
