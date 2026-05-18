/** RidgeLines — вертикально уложенные нормированные кривые (каждая
 *  нормируется к своему максимуму). Календарь природы. */
export interface RidgeSeries { label: string; values: number[]; }
export interface RidgeLinesProps {
  series: RidgeSeries[];
  xLabels: string[];
  height?: number;
  colors?: string[];
}
export function RidgeLines({ series, xLabels, height, colors }: RidgeLinesProps) {
  const W = 900, padL = 130, padR = 16, padT = 18, padB = 24;
  const H = height ?? padT + padB + series.length * 46;
  const rowH = (H - padT - padB) / Math.max(series.length, 1);
  const n = Math.max(series[0]?.values.length ?? xLabels.length, 1);
  const xx = (i: number) => padL + (i / Math.max(n - 1, 1)) * (W - padL - padR);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img"
         style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
      {series.map((s, si) => {
        const baseY = padT + si * rowH + rowH;
        const col = colors?.[si] ?? "var(--forest)";
        const mx = Math.max(...s.values, 1);
        const pts = s.values
          .map((v, i) => `${xx(i)},${baseY - (v / mx) * (rowH * 0.92)}`)
          .join(" ");
        const area = `${padL},${baseY} ${pts} ${xx(n - 1)},${baseY}`;
        return (
          <g key={s.label}>
            <polygon points={area} fill={col} opacity={0.32} />
            <polyline points={pts} fill="none" stroke={col}
                      strokeWidth={1.5} />
            <text x={padL - 8} y={baseY - 6} textAnchor="end"
                  fill="var(--ink-dim)">{s.label}</text>
          </g>
        );
      })}
      {xLabels.map((l, i) =>
        i % Math.ceil(xLabels.length / 12 || 1) === 0 ? (
          <text key={i} x={xx((i / Math.max(xLabels.length - 1, 1)) * (n - 1))}
                y={H - 6} textAnchor="middle" fill="var(--ink-faint)">{l}</text>
        ) : null,
      )}
    </svg>
  );
}
