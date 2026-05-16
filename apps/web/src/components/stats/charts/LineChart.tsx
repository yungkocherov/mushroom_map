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
}

export function LineChart({ data, xKey, yKey, height = 240 }: LineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RLineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--ink-faint)" fontSize={11} />
        <YAxis stroke="var(--ink-faint)" fontSize={11} />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: 8,
            fontSize: 12,
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
