const SYRINGE_UNITS = 100;

export function Syringe({ fillUnits }: { fillUnits: number }) {
  const clamped = Math.max(0, Math.min(SYRINGE_UNITS, fillUnits));
  const barrelX = 40;
  const barrelWidth = 500;
  const fillWidth = (clamped / SYRINGE_UNITS) * barrelWidth;
  return (
    <svg viewBox="0 0 620 120" role="img" aria-label={`Insulin syringe filled to ${clamped} units`} className="w-full">
      <rect x={barrelX} y="30" width={barrelWidth} height="44" fill="var(--panel)" stroke="var(--ink)" strokeWidth="3" />
      <rect x={barrelX} y="30" width={fillWidth} height="44" fill="var(--ok)" opacity="0.35" />
      <line x1={barrelX + fillWidth} y1="22" x2={barrelX + fillWidth} y2="82" stroke="var(--stop)" strokeWidth="4" />
      {Array.from({ length: 11 }, (_, index) => {
        const x = barrelX + (index / 10) * barrelWidth;
        return (
          <g key={index}>
            <line x1={x} y1="74" x2={x} y2="88" stroke="var(--ink)" strokeWidth="2" />
            <text x={x} y="106" textAnchor="middle" fontSize="14" fontWeight="700" fill="var(--ink)">
              {index * 10}
            </text>
          </g>
        );
      })}
      <rect x="6" y="46" width="34" height="12" fill="var(--ink)" />
      <rect x={barrelX + barrelWidth} y="48" width="70" height="8" fill="var(--ink)" />
    </svg>
  );
}

