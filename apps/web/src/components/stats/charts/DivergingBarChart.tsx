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
  categoryWidth?: number;
  /**
   * When true, render vertical bars with the category on the X axis
   * (value on Y, zero baseline horizontal). Default false keeps the
   * original horizontal-bars / category-on-Y behaviour unchanged.
   * `categoryWidth` applies only to the category-on-Y mode.
   */
  categoryOnX?: boolean;
}

export function DivergingBarChart({
  data, categoryKey, valueKey, colorPos, colorNeg, height = 280,
  categoryWidth = 60, categoryOnX = false,
}: DivergingBarChartProps) {
  const tooltip = (
    <Tooltip
      contentStyle={{
        background: "var(--paper-rise)",
        border: "1px solid var(--rule)",
        borderRadius: "var(--radius-md)",
        fontSize: "var(--fs-xs)",
      }}
    />
  );
  const cells = data.map((d, i) => (
    <Cell key={i}
          fill={Number(d[valueKey]) < 0 ? colorNeg : colorPos} />
  ));

  if (categoryOnX) {
    return (
      <ResponsiveContainer width="100%" height={height}>
        <RBarChart data={data} layout="horizontal"
                   margin={{ top: 4, right: 16, bottom: 4, left: 8 }}>
          <CartesianGrid stroke="var(--rule)" strokeDasharray="3 3"
                         vertical={false} />
          <XAxis type="category" dataKey={categoryKey}
                 stroke="var(--ink-faint)" fontSize="var(--fs-xs)"
                 interval={0} />
          <YAxis type="number" stroke="var(--ink-faint)"
                 fontSize="var(--fs-xs)" />
          {tooltip}
          <ReferenceLine y={0} stroke="var(--ink-faint)" />
          <Bar dataKey={valueKey} radius={[2, 2, 0, 0]}>
            {cells}
          </Bar>
        </RBarChart>
      </ResponsiveContainer>
    );
  }

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
               width={categoryWidth} interval={0} />
        {tooltip}
        <ReferenceLine x={0} stroke="var(--ink-faint)" />
        <Bar dataKey={valueKey} radius={[0, 2, 2, 0]}>
          {cells}
        </Bar>
      </RBarChart>
    </ResponsiveContainer>
  );
}
