import type { Edibility } from "@mushroom-map/types";
import { EDIBILITY_LABEL, EDIBILITY_TONE } from "./labels";


interface Props {
  edibility: Edibility;
  /** Если true — добавляем мелкую рамку «ВНИМАНИЕ», применяем только к
   *  deadly. Видно отличие «ядовитого» от «смертельного» в списке. */
  emphasizeDeadly?: boolean;
  compact?: boolean;
}


export function EdibilityChip({ edibility, emphasizeDeadly = true, compact = false }: Props) {
  const tone = EDIBILITY_TONE[edibility];
  const label = EDIBILITY_LABEL[edibility];
  const isDeadly = edibility === "deadly";
  const size = compact
    ? { fontSize: "var(--fs-xs)", padding: "1px 6px" }
    : { fontSize: "var(--fs-sm)", padding: "2px 8px" };

  return (
    <span
      style={{
        display:        "inline-block",
        background:     tone.bg,
        color:          tone.fg,
        borderRadius:   "999px",
        fontWeight:     500,
        lineHeight:     1.4,
        letterSpacing:  "0.01em",
        border: isDeadly && emphasizeDeadly ? "1.5px solid var(--ink)" : "none",
        ...size,
      }}
    >
      {label}
    </span>
  );
}
