/**
 * DivergingBarChart — signed horizontal bars around 0 (anomalies).
 * Recharts isolated here; colors only from passed CSS-var tokens
 * (Claude Design re-skins).
 */
import {
  ResponsiveContainer, BarChart as RBarChart, Bar, Cell,
  XAxis, YAxis, Tooltip, ReferenceLine, CartesianGrid,
} from "recharts";

export interface DivergingBarChartProps {
  data: Array<Record<string, number | string | null>>;
  categoryKey: string;
  valueKey: string;
  colorPos: string;
  colorNeg: string;
  height?: number;
}

export function DivergingBarChart({
  data, categoryKey, valueKey, colorPos, colorNeg, height = 280,
}: DivergingBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical"
                 margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3"
                       horizontal={false} />
        <XAxis type="number" stroke="var(--ink-faint)"
               fontSize="var(--fs-xs)" />
        <YAxis type="category" dataKey={categoryKey}
               stroke="var(--ink-faint)" fontSize="var(--fs-xs)"
               width={60} interval={0} />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <ReferenceLine x={0} stroke="var(--ink-faint)" />
        <Bar dataKey={valueKey} radius={[0, 2, 2, 0]}>
          {data.map((d, i) => (
            <Cell key={i}
                  fill={Number(d[valueKey]) < 0 ? colorNeg : colorPos} />
          ))}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}
