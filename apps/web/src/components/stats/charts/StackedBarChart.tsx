/**
 * StackedBarChart — 100%-стек горизонтальных баров (composition по
 * дискретной категории). Recharts изолирован здесь; цвета только из
 * переданных CSS-var-имён (Claude Design проход переодевает токены).
 */
import {
  ResponsiveContainer,
  BarChart as RBarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
} from "recharts";

export interface StackedSeries {
  key: string;
  label: string;
  color: string;
}

export interface StackedBarChartProps {
  data: Array<Record<string, number | string>>;
  categoryKey: string;
  series: StackedSeries[];
  height?: number;
}

export function StackedBarChart({ data, categoryKey, series, height = 360 }: StackedBarChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RBarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
        <XAxis
          type="number"
          domain={[0, 1]}
          tickFormatter={(v) => `${Math.round(Number(v) * 100)}%`}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
        />
        <YAxis
          type="category"
          dataKey={categoryKey}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          width={140}
        />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
          formatter={(v, n) => [`${Math.round(Number(v) * 100)}%`, n]}
        />
        <Legend wrapperStyle={{ fontSize: "var(--fs-xs)" }} />
        {series.map((s) => (
          <Bar key={s.key} dataKey={s.key} name={s.label} stackId="1" fill={s.color} />
        ))}
      </RBarChart>
    </ResponsiveContainer>
  );
}
