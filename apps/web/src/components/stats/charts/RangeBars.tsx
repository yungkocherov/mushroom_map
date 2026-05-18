/** RangeBars — горизонтальные «полосы сезона» на общей оси. */
export interface RangeBarItem { label: string; start: number; end: number; mark?: number; }
export interface RangeBarsProps {
  items: RangeBarItem[];
  min: number;
  max: number;
  ticks?: { at: number; label: string }[];
  height?: number;
}
export function RangeBars({ items, min, max, ticks = [], height }: RangeBarsProps) {
  const W = 900, padL = 200, padR = 16, padT = 8, padB = 24;
  const rowH = 39;
  const H = height ?? padT + padB + items.length * rowH;
  const span = Math.max(max - min, 1);
  const x = (v: number) => padL + ((v - min) / span) * (W - padL - padR);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         style={{ fontFamily: "var(--font-mono)", fontSize: 14 }}>
      {ticks.map((t) => (
        <g key={t.at}>
          <line x1={x(t.at)} x2={x(t.at)} y1={padT} y2={H - padB}
                stroke="var(--rule)" strokeDasharray="3 3" />
          <text x={x(t.at)} y={H - 8} textAnchor="middle"
                fill="var(--ink-faint)">{t.label}</text>
        </g>
      ))}
      {items.map((it, i) => {
        const y = padT + i * rowH;
        return (
          <g key={it.label}>
            <text x={padL - 8} y={y + rowH / 2} textAnchor="end"
                  dominantBaseline="middle" fill="var(--ink-dim)">{it.label}</text>
            <rect x={x(it.start)} y={y + 8} width={Math.max(x(it.end) - x(it.start), 2)}
                  height={rowH - 18} rx={3} fill="var(--forest)" opacity={0.75} />
            {it.mark != null && (
              <line x1={x(it.mark)} x2={x(it.mark)} y1={y + 3} y2={y + rowH - 6}
                    stroke="var(--chanterelle)" strokeWidth={2} />
            )}
          </g>
        );
      })}
    </svg>
  );
}
