/**
 * Мини-график 12 месяцев активности вида. Активный месяц — заливка
 * forest'ом; неактивный — тонкая плашка var(--rule). На десктопе
 * подписи месяцев снизу; в compact-режиме (карточка каталога) — без подписей,
 * только полоска.
 */


interface Props {
  months: number[];
  compact?: boolean;
  ariaLabel?: string;
}


const MONTH_ABBR = ["Я", "Ф", "М", "А", "М", "И", "И", "А", "С", "О", "Н", "Д"];


export function SeasonBar({ months, compact = false, ariaLabel }: Props) {
  const active = new Set(months);
  const describedMonths = months
    .map((m) => MONTH_ABBR[Math.max(0, Math.min(11, m - 1))])
    .join(", ");

  return (
    <div
      role="img"
      aria-label={ariaLabel ?? (months.length ? `Сезон: ${describedMonths}` : "Нет данных о сезоне")}
      style={{
        display:             "grid",
        gridTemplateColumns: "repeat(12, 1fr)",
        gap:                 compact ? 1 : 2,
        width:               "100%",
      }}
    >
      {Array.from({ length: 12 }, (_, i) => {
        const month = i + 1;
        const isActive = active.has(month);
        return (
          <div
            key={month}
            style={{
              display:         "flex",
              flexDirection:   "column",
              alignItems:      "stretch",
              gap:             compact ? 0 : 2,
            }}
          >
            <div
              style={{
                height:      compact ? 6 : 10,
                borderRadius: 2,
                background:  isActive ? "var(--forest)" : "var(--rule)",
              }}
            />
            {!compact && (
              <span
                aria-hidden="true"
                style={{
                  textAlign:  "center",
                  fontSize:   "var(--fs-xs)",
                  color:      isActive ? "var(--ink)" : "var(--ink-faint)",
                  marginTop:  2,
                  fontFamily: "var(--font-mono)",
                }}
              >
                {MONTH_ABBR[i]}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
