"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

const MAIN_LINKS = [
  { href: "/", label: "Cabinet" },
  { href: "/add", label: "Add" },
  { href: "/symptoms", label: "Symptoms" },
  { href: "/profile", label: "About you" },
] as const;

const TOOL_LINKS = [
  { href: "/profile", label: "About you", phoneOnly: true },
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
    <header className="fixed z-40 inset-x-0 top-0 print:hidden bg-[rgba(25,26,30,0.96)] border-b border-dashed border-[var(--hair)] pb-3">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-[var(--margin)] pt-[var(--margin)]">
        <Link href="/" className="flex items-center gap-2 py-2 -my-2 text-ink">
          <Mark />
          <span className="wordmark text-[15px]">Shelf Check</span>
        </Link>
        <nav aria-label="Main" className="flex flex-nowrap items-center gap-x-1 max-w-full overflow-x-auto [scrollbar-width:none] max-sm:-mx-[var(--margin)] max-sm:px-[var(--margin)] font-[family-name:var(--font-space)] text-[12px] font-bold uppercase whitespace-nowrap">
          {MAIN_LINKS.map((link, index) => (
            <span key={link.href} className={`flex items-center ${link.href === "/profile" ? "max-sm:hidden" : ""}`}>
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
          </div>
        </nav>
      </div>
      {open &&
        createPortal(
          <div
            id="more-tools"
            ref={panel}
            style={{ position: "fixed" }}
            className="facts !bg-[var(--panel)] fixed right-[var(--margin)] top-[calc(var(--margin)+84px)] sm:top-[calc(var(--margin)+40px)] w-[260px] grid gap-1 p-3 z-50"
          >
            {TOOL_LINKS.map((link) => (
              <Link
                key={link.href}
                data-phone-only={"phoneOnly" in link ? "true" : undefined}
                href={link.href}
                aria-current={pathname === link.href ? "page" : undefined}
                className={`block rounded-full px-3 py-2 font-[family-name:var(--font-space)] text-[12px] font-bold uppercase hover:bg-[var(--faint)] ${"phoneOnly" in link ? "sm:hidden" : ""} ${pathname === link.href ? "text-accent" : "text-ink"}`}
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
