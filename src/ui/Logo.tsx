// Логотип Team Tracker (ADR-013): знак — встроенный SVG с цветами из переменных активной гаммы
// (--logo-ring, --logo-check), надпись — обычный текст. Геометрия совпадает с Logo/*/mark.svg.

/** Знак: круг со стрелкой и галочка. Для 16–32 px линии толще (7), иначе 6. */
export function LogoMark({ size = 28 }: { size?: number }) {
  const stroke = size <= 32 ? 7 : 6;
  return (
    <svg
      className="logo-mark"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M52.78 20 A24 24 0 1 1 35.34 8.23"
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        style={{ stroke: 'var(--logo-ring)' }}
      />
      <polygon
        points="45.24,9.62 36.31,1.30 34.37,15.16"
        strokeWidth={2}
        strokeLinejoin="round"
        style={{ fill: 'var(--logo-ring)', stroke: 'var(--logo-ring)' }}
      />
      <polyline
        points="23,33 29.5,39.5 41,27"
        fill="none"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ stroke: 'var(--logo-check)' }}
      />
    </svg>
  );
}

/** Знак и надпись «Team Tracker»: «Team» цветом круга, «Tracker» цветом галочки. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="logo-lockup">
      <LogoMark size={size} />
      <span className="logo-text" style={{ fontSize: `${Math.round(size * 0.68)}px` }}>
        <span className="logo-team">Team</span> <span className="logo-tracker">Tracker</span>
      </span>
    </span>
  );
}
