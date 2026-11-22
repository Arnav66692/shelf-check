export function HeroTitle({ before, swap, after }: { before: string; swap: string; after: string }) {
  return (
    <>
      {before}{" "}
      <span className="hero-swap" data-word={swap}>
        <span className="hero-swap-heavy">{swap}</span>
        <span className="hero-swap-thin" aria-hidden="true">
          {swap}
        </span>
      </span>{" "}
      {after}
    </>
  );
}
