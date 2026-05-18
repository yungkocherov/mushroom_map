/**
 * BarChart — горизонтальный bar. Единственное (вместе с LineChart/
 * AreaChart) место, знающее про Recharts. Цвета только из CSS-vars,
 * чтобы Claude Design проход переодевал без правок логики.
 */
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface BarChartProps {
  data: Array<Record<string, number | string | null>>;
  categoryKey: string;
  valueKey: string;
  height?: number;
  /**
   * Optional fixed [min, max] for the numeric (X) axis. When given,
   * the axis is hard-clamped (allowDataOverflow) so bars share a scale
   * across small-multiples. Omit for the default data-driven domain.
   */
  xDomain?: [number, number];
}

export function BarChart({ data, categoryKey, valueKey, height = 280, xDomain }: BarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" horizontal={false} />
        <XAxis
          type="number"
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          domain={xDomain}
          allowDataOverflow={xDomain !== undefined}
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          width={150}
          interval={0}
        />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <Bar dataKey={valueKey} fill="var(--forest)" radius={[0, 4, 4, 0]} />
      </RBarChart>
    </ResponsiveContainer>
  );
}
