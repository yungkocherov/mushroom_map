/**
 * AreaChart — стэк площадей по сериям. Recharts изолирован здесь;
 * цвета берём из переданного массива CSS-var-имён (Claude Design
 * проход меняет токены, не этот файл).
 */
import {
  ResponsiveContainer,
  AreaChart as RAreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";

export interface AreaSeries {
  key: string;
  label: string;
  /** CSS-var color, e.g. "var(--idx-3)" */
  color: string;
}

export interface AreaChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: AreaSeries[];
  height?: number;
}

export function AreaChart({ data, xKey, series, height = 300 }: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" />
        <XAxis dataKey={xKey} stroke="var(--ink-faint)" fontSize="var(--fs-xs)" />
        <YAxis stroke="var(--ink-faint)" fontSize="var(--fs-xs)" />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
        />
        <Legend wrapperStyle={{ fontSize: "var(--fs-xs)" }} />
        {series.map((s) => (
          <Area
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stackId="1"
            stroke={s.color}
            fill={s.color}
            fillOpacity={0.55}
          />
        ))}
      </RAreaChart>
    </ResponsiveContainer>
  );
}
