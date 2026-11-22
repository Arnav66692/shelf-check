export function Intro() {
  return (
    <div className="intro" aria-hidden="true">
      <p className="absolute left-1/2 top-[12%] -translate-x-1/2 w-[min(320px,80vw)] text-center text-[0.72rem] uppercase tracking-[0.14em] text-ink-soft">
        Two bottles can hide the same drug. Not for much longer.
      </p>
      <svg className="intro-keyhole absolute left-1/2 top-1/2 -ml-[26px] -mt-[44px]" width="52" height="88" viewBox="0 0 52 88">
        <defs>
          <filter id="keyhole-blur">
            <feGaussianBlur stdDeviation="3.5" />
          </filter>
        </defs>
        <path d="M26 6a18 18 0 0 1 9 33.6L42 82H10l7-42.4A18 18 0 0 1 26 6z" fill="#2c5bd8" filter="url(#keyhole-blur)" opacity="0.9" />
      </svg>
      <div className="absolute left-4 right-4 bottom-6 flex items-center gap-4 text-[0.68rem] uppercase tracking-[0.14em] text-ink-soft">
        <span>Shelf Check</span>
        <span className="relative flex-1 h-px bg-[var(--hair)]">
          <span className="intro-line absolute inset-0 bg-ink-soft" />
        </span>
        <span>Reading labels</span>
      </div>
    </div>
  );
}
