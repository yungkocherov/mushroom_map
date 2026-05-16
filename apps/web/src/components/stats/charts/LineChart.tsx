/**
 * LineChart — тонкая обёртка над Recharts. ЕДИНСТВЕННОЕ место, где
 * раздел «Статистика» знает про Recharts. Цвета — только из CSS-vars
 * (--forest и т.д.), чтобы Claude Design проход переодевал график без
 * правок логики виджетов.
 */
import {
  ResponsiveContainer,
  LineChart as RLineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface LineChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  yKey: string;
  height?: number;
  /**
   * Recharts XAxis type. Pass "number" for numeric week axes so ticks are
   * evenly spaced regardless of gaps in the data.
   */
  xType?: "number" | "category";
  /** When xType="number": the [min, max] domain. */
  xDomain?: [number, number];
  /** When xType="number": explicit tick positions. */
  xTicks?: number[];
}

export function LineChart({
  data,
  xKey,
  yKey,
  height = 240,
  xType,
  xDomain,
  xTicks,
}: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          type={xType ?? "category"}
          domain={xType === "number" ? xDomain : undefined}
          ticks={xType === "number" ? xTicks : undefined}
          allowDecimals={false}
        />
        <YAxis stroke="var(--ink-faint)" fontSize="var(--fs-xs)" />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <Line
          type="monotone"
          dataKey={yKey}
          stroke="var(--forest)"
          strokeWidth={2}
          dot={false}
        />
      </RLineChart>
    </ResponsiveContainer>
  );
}
