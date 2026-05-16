/**
 * MultiLineChart — N overlaid series + optional norm band.
 * Uses ComposedChart so band (Area) can sit behind the Lines.
 * Only Recharts import in this file (intentional isolation).
 */
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";

export interface MultiLineSeries {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

export interface MultiLineBand {
  lowerKey: string;
  upperKey: string;
  color: string;
}

export interface MultiLineChartProps {
  data: Array<Record<string, number | string | null>>;
  xKey: string;
  series: MultiLineSeries[];
  band?: MultiLineBand;
  height?: number;
}

export function MultiLineChart({
  data,
  xKey,
  series,
  band,
  height = 260,
}: MultiLineChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 0 }}>
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
        {band && (
          <Area
            type="monotone"
            dataKey={band.upperKey}
            stroke="none"
            fill={band.color}
            fillOpacity={0.18}
            legendType="none"
            activeDot={false}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {band && (
          <Area
            type="monotone"
            dataKey={band.lowerKey}
            stroke="none"
            fill="var(--paper-rise)"
            fillOpacity={1}
            legendType="none"
            activeDot={false}
            dot={false}
            isAnimationActive={false}
          />
        )}
        {series.map((s) => (
          <Line
            key={s.key}
            type="monotone"
            dataKey={s.key}
            name={s.label}
            stroke={s.color}
            strokeWidth={2}
            strokeDasharray={s.dashed ? "5 4" : undefined}
            dot={false}
            connectNulls={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
