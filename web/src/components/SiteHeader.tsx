"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useCabinet } from "@/lib/store";
import { PersonSwitcher } from "./PersonSwitcher";

const MENU_LINKS = [
  { href: "/", label: "Cabinet" },
  { href: "/add", label: "Add" },
  { href: "/symptoms", label: "Symptoms" },
  { href: "/profile", label: "About you" },
  { href: "/pills", label: "Pill finder" },
  { href: "/dose", label: "Dose check" },
  { href: "/peptides", label: "Peptides" },
  { href: "/tested", label: "How we tested" },
] as const;

function Mark() {
  return (
    <svg viewBox="0 0 25 25" width="25" height="25" aria-hidden="true">
      <path
        d="M10.5 6.2c-1.6-1-4.4-.6-4.7 1.5-.4 2.7 4.6 3 4.4 6.1-.2 2.4-3.4 3.3-5.6 1.7M19.8 7.1c-1.3-1.3-4.3-1.1-5.3 1.4-1 2.6-.4 6.6 2.1 7.4 1.4.5 2.7 0 3.6-1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path d="M4 20.5h17" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function MenuPill({ open }: { open: boolean }) {
  return (
    <span
      className={`relative block h-8 w-[103px] rounded-full border border-current transition-colors duration-300 ${open ? "bg-current" : ""}`}
    >
      <span
        className={`absolute inset-0 grid place-items-center text-[13px] italic font-[200] uppercase tracking-[0.02em] transition-opacity duration-200 ${open ? "opacity-0" : "opacity-100"}`}
      >
        Menu
      </span>
      <span className={`absolute inset-0 grid place-items-center transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}>
        <span className="grid gap-[4px] w-7">
          <span className="block h-px bg-[var(--paper)] mix-blend-difference" />
          <span className="block h-px bg-[var(--paper)] mix-blend-difference" />
          <span className="block h-px bg-[var(--paper)] mix-blend-difference" />
        </span>
      </span>
    </span>
  );
}

export function SiteHeader() {
  const pathname = usePathname();
  const { items } = useCabinet();
  const [menu, setMenu] = useState({ open: false, path: pathname });
  const open = menu.open && menu.path === pathname;
  const setOpen = (next: boolean | ((value: boolean) => boolean)) =>
    setMenu((current) => ({ path: pathname, open: typeof next === "function" ? next(current.open && current.path === pathname) : next }));
  const panel = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const first = panel.current?.querySelector<HTMLElement>("a, button");
    first?.focus();
    document.body.classList.add("menu-open");
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setMenu((current) => ({ ...current, open: false }));
        button.current?.focus();
      }
      if (event.key !== "Tab" || !panel.current) return;
      const focusable = [...panel.current.querySelectorAll<HTMLElement>("a, button")];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === focusable[0]) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        button.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.classList.remove("menu-open");
    };
  }, [open]);

  return (
    <header className="print:hidden">
      <div className="h-[112px]" />
      <Link
        href="/"
        aria-label="Shelf Check home"
        className="fixed z-50 top-[44px] left-[var(--space-1)] text-ink"
      >
        <Mark />
      </Link>
      <div className="fixed z-50 top-[40px] right-[var(--space-1)] flex items-center gap-3 text-ink">
        <Link href="/" className="hidden sm:inline text-[13px] font-[300] uppercase" aria-label={`Cabinet, ${items.length} items`}>
          Cabinet [{items.length}]
        </Link>
        <button
          ref={button}
          type="button"
          aria-expanded={open}
          aria-controls="site-menu"
          aria-label={open ? "Close menu" : "Open menu"}
          onClick={() => setOpen((value) => !value)}
        >
          <MenuPill open={open} />
        </button>
      </div>
      <div
        id="site-menu"
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-label="Menu"
        className={`fixed inset-0 z-40 bg-[var(--paper)] flex flex-col justify-center px-[var(--space-1)] transition-[opacity,transform,visibility] duration-[600ms] ease-[cubic-bezier(.02,.71,.21,.92)] ${open ? "opacity-100 scale-100 visible" : "opacity-0 scale-[1.06] invisible"}`}
      >
        <nav aria-label="Main" className="w-full overflow-y-auto max-h-[100dvh] pt-[112px] pb-10">
          <ul>
            {MENU_LINKS.map((link) => (
              <li key={link.href} className="border-b border-[var(--rule)] last:border-b-0">
                <Link
                  href={link.href}
                  aria-current={pathname === link.href ? "page" : undefined}
                  className="block text-center py-[clamp(14px,2.2vh,28px)] italic uppercase leading-[0.88] tracking-[-0.04em] text-[clamp(32px,calc(32px+64*(100vw-500px)/2060),96px)] font-[100] hover:font-[900] focus-visible:font-[900] transition-[font-weight] duration-[400ms] aria-[current=page]:font-[900]"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
      <div className="px-[var(--space-1)] -mt-[40px] mb-8">
        <PersonSwitcher />
      </div>
    </header>
  );
}
