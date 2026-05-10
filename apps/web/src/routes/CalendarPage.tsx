import { usePageTitle } from "../lib/usePageTitle";

/**
 * Calendar — `/calendar`. Phase W2 placeholder; Phase W5 ports D1VCalendar
 * (12-month species ribbon, current month highlighted, peak markers).
 */
export function CalendarPage() {
  usePageTitle("Календарь — Geobiom");
  return (
    <section
      style={{
        padding: "var(--space-8) var(--space-5)",
        maxWidth: 880,
        margin: "0 auto",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
          letterSpacing: "0.16em",
          textTransform: "uppercase",
          color: "var(--ink-dim)",
          marginBottom: "var(--space-2)",
        }}
      >
        сезон 2026 · ленобласть
      </div>
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-display)",
          fontWeight: 500,
          letterSpacing: "-0.025em",
          margin: 0,
        }}
      >
        Год, как{" "}
        <em style={{ color: "var(--chanterelle)", fontStyle: "italic" }}>
          лента
        </em>
        .
      </h1>
      <p
        style={{
          fontSize: "var(--fs-lg)",
          color: "var(--ink-dim)",
          marginTop: "var(--space-3)",
          lineHeight: "var(--lh-normal)",
        }}
      >
        Скоро здесь будет 12 месяцев × 12 видов: толщина полосы — длительность
        сезона, тёмная отметка — пик плодоношения.
      </p>
    </section>
  );
}
