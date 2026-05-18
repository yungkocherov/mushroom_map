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
  /**
   * Optional fixed [min, max] for the Y axis.
   * Pass [0, 1] for a true 100%-stack chart to clamp the axis.
   */
  yDomain?: [number, number];
  /**
   * Optional Y-tick formatting. "percent" renders ticks as 0%..100%
   * (for a 100%-composition chart — bulletproof against float drift
   * like 1.0000002). Omit for raw numeric ticks (default, unchanged).
   */
  yTickFormat?: "percent";
  /** Format tooltip values as percent (0.1 → "10%"). */
  tooltipPercent?: boolean;
  /** Format the tooltip header / X value (week → month). */
  xTickFormatter?: (v: number | string) => string;
}

export function AreaChart({
  data,
  xKey,
  series,
  height = 300,
  yDomain,
  yTickFormat,
  tooltipPercent,
  xTickFormatter,
}: AreaChartProps) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <RAreaChart data={data} margin={{ top: 20, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3" />
        <XAxis
          dataKey={xKey}
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          tickFormatter={xTickFormatter}
        />
        <YAxis
          stroke="var(--ink-faint)"
          fontSize="var(--fs-xs)"
          domain={yDomain}
          // When a fixed yDomain is given, treat it as a HARD clamp:
          // without this Recharts expands the axis to data overflow
          // (rounded shares can sum to 1.01 -> garbled "1.0000002" tick).
          allowDataOverflow={yDomain !== undefined}
          tickFormatter={
            yTickFormat === "percent"
              ? (v) => `${Math.round(Number(v) * 100)}%`
              : undefined
          }
        />
        <Tooltip
          contentStyle={{
            background: "var(--paper-rise)",
            border: "1px solid var(--rule)",
            borderRadius: "var(--radius-md)",
            fontSize: "var(--fs-xs)",
          }}
          formatter={(val) =>
            tooltipPercent && typeof val === "number"
              ? `${Math.round(val * 100)}%`
              : val
          }
          labelFormatter={(l) => (xTickFormatter ? xTickFormatter(l) : l)}
          itemSorter={(item: any) => series.findIndex((s) => s.key === item.dataKey)}
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
