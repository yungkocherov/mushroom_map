import { Link } from "react-router-dom";
import { Wordmark } from "../components/Wordmark";
import { usePageTitle } from "../lib/usePageTitle";

/**
 * Landing — `/`. Phase W2 placeholder; Phase W3 ports D1VLanding fully
 * (hero «Лес, как атлас.», animated counter, map cameo, contour wash).
 */
export function LandingPage() {
  usePageTitle("Geobiom — лес ленобласти");
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
      <Wordmark size="lg" />
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-hero)",
          fontWeight: 500,
          letterSpacing: "-0.03em",
          lineHeight: 0.98,
          margin: "var(--space-7) 0 var(--space-4) 0",
        }}
      >
        Лес,<br />
        как{" "}
        <em style={{ color: "var(--chanterelle)", fontStyle: "italic" }}>
          атлас
        </em>
        .
      </h1>
      <p
        style={{
          fontSize: "var(--fs-lg)",
          color: "var(--ink-dim)",
          maxWidth: 540,
          lineHeight: "var(--lh-normal)",
        }}
      >
        Грибная погода Ленобласти: индекс плодоношения по 18 районам, типы
        леса и микориза для каждого выдела, личные споты в кабинете.
      </p>
      <div style={{ display: "flex", gap: "var(--space-3)", marginTop: "var(--space-6)" }}>
        <Link
          to="/map"
          className="btn-interactive"
          style={{
            padding: "var(--space-4) var(--space-5)",
            background: "var(--forest)",
            color: "var(--cream)",
            border: 0,
            borderRadius: "var(--radius-lg)",
            fontSize: "var(--fs-body)",
            fontWeight: 500,
            textDecoration: "none",
            boxShadow: "0 8px 22px rgba(62,72,39,0.28)",
          }}
        >
          Открыть карту
        </Link>
        <Link
          to="/methodology"
          className="btn-interactive"
          style={{
            padding: "var(--space-4) var(--space-5)",
            background: "transparent",
            color: "var(--ink)",
            border: "1.5px solid var(--ink)",
            borderRadius: "var(--radius-lg)",
            fontSize: "var(--fs-body)",
            fontWeight: 500,
            textDecoration: "none",
          }}
        >
          Как это работает
        </Link>
      </div>
      <div
        style={{
          marginTop: "var(--space-7)",
          fontFamily: "var(--font-mono)",
          fontSize: "var(--fs-xs)",
          color: "var(--ink-dim)",
          letterSpacing: "0.04em",
        }}
      >
        Phase W3 наполнит hero animated counter, map cameo, contour wash.
      </div>
    </section>
  );
}
