/** Heatmap — токен-цветная сетка. value->bucket по 5 ступеням
 *  (--idx-0..--idx-4) — RANK/quantile, не linear: одна доминирующая
 *  ячейка иначе схлопывает всю шкалу в один оттенок. Recharts тут не
 *  нужен. */
export interface HeatmapProps {
  rows: string[];
  cols: (string | number)[];
  values: (number | null)[][]; // [row][col]
  height?: number;
  /** optional fixed max for color scaling; default = data max */
  vmax?: number;
}
export function Heatmap({ rows, cols, values, height = 320, vmax }: HeatmapProps) {
  const flat = values.flat().filter((v): v is number => v != null);
  void vmax; // kept for call-site compat; rank-bucketing ignores fixed max

  // Rank/quantile bucket: one dominant cell would compress a linear
  // floor(v/max*5) so 23/25 cells collapse to one shade. Map each value
  // to a 0..4 bucket by its rank among distinct non-null values, so all
  // 5 color steps are populated and differences stay visible.
  const distinct = [...new Set(flat)].sort((a, b) => a - b);
  const rankOf = new Map<number, number>(distinct.map((v, i) => [v, i]));

  // Detect whether column labels are long (need rotation to avoid overlap)
  const maxColLabelLen = Math.max(...cols.map((c) => String(c).length), 0);
  const rotateCols = maxColLabelLen > 4;

  // Extra bottom padding when labels are rotated so they aren't clipped
  const padB = rotateCols ? 72 : 28;
  const W = 900, padL = 110, padT = 8, padR = 8;
  const gw = (W - padL - padR) / Math.max(cols.length, 1);
  const gh = (height - padT - padB) / Math.max(rows.length, 1);
  const bucket = (v: number) =>
    distinct.length > 0
      ? Math.min(4, Math.floor(((rankOf.get(v) ?? 0) / distinct.length) * 5))
      : 0;
  return (
    <svg viewBox={`0 0 ${W} ${height}`} width="100%" role="img"
         style={{ fontFamily: "var(--font-mono)", fontSize: 11 }}>
      {rows.map((r, ri) =>
        cols.map((_, ci) => {
          const v = values[ri]?.[ci];
          const fill = v == null ? "var(--paper-rise)" : `var(--idx-${bucket(v)})`;
          return (
            <g key={`${ri}-${ci}`}>
              <rect x={padL + ci * gw} y={padT + ri * gh}
                    width={gw - 1} height={gh - 1} fill={fill} rx={1}>
                <title>{`${r} / ${cols[ci]}: ${v ?? "—"}`}</title>
              </rect>
              {v != null && (() => {
                // Contrast-aware cell-value text. Dark buckets (deep-green
                // --idx-0/1) need a light fill; pale-green --idx-2/3 and the
                // terracotta --idx-4 read fine with the dark ink token.
                const b = bucket(v);
                const txt = b <= 1 ? "var(--paper)" : "var(--ink)";
                return (
                  <text x={padL + ci * gw + gw / 2} y={padT + ri * gh + gh / 2}
                        textAnchor="middle" dominantBaseline="middle"
                        fill={txt}
                        style={{ fontFamily: "var(--font-mono)", fontSize: 10 }}>
                    {v}
                  </text>
                );
              })()}
            </g>
          );
        }),
      )}
      {rows.map((r, ri) => (
        <text key={`r${ri}`} x={padL - 6} y={padT + ri * gh + gh / 2}
              textAnchor="end" dominantBaseline="middle"
              fill="var(--ink-dim)">{r}</text>
      ))}
      {cols.map((c, ci) => {
        // Always render all labels when rotated; when horizontal thin out if too many
        if (!rotateCols && ci % Math.ceil(cols.length / 14 || 1) !== 0) return null;

        const cx = padL + ci * gw + gw / 2;
        if (rotateCols) {
          // Rotated -35° anchored at column center near the bottom of the grid
          const labelY = padT + rows.length * gh + 6;
          return (
            <text
              key={`c${ci}`}
              x={cx}
              y={labelY}
              textAnchor="end"
              fill="var(--ink-faint)"
              transform={`rotate(-35, ${cx}, ${labelY})`}
            >
              {String(c)}
            </text>
          );
        }
        return (
          <text key={`c${ci}`} x={cx} y={height - 8}
                textAnchor="middle" fill="var(--ink-faint)">{String(c)}</text>
        );
      })}
    </svg>
  );
}
