import { useNavigate } from "react-router-dom";
import { Wordmark } from "../components/Wordmark";
import { setOnboarded } from "../lib/onboardingStorage";
import { usePageTitle } from "../lib/usePageTitle";

/**
 * Onboarding — `/onboarding`. Phase W2 placeholder; Phase W3 ports
 * D1VOnboarding (3-step wizard: geolocation → район → готово).
 */
export function OnboardingPage() {
  usePageTitle("Привет, грибник — Geobiom");
  const navigate = useNavigate();
  const finish = () => {
    setOnboarded();
    navigate("/", { replace: true });
  };
  return (
    <section
      style={{
        padding: "var(--space-8) var(--space-5)",
        maxWidth: 720,
        margin: "0 auto",
        fontFamily: "var(--font-body)",
        color: "var(--ink)",
      }}
    >
      <Wordmark size="md" />
      <h1
        style={{
          fontFamily: "var(--font-display)",
          fontSize: "var(--fs-display)",
          fontWeight: 500,
          letterSpacing: "-0.03em",
          lineHeight: 1.02,
          margin: "var(--space-6) 0 var(--space-3) 0",
        }}
      >
        Привет, грибник.
      </h1>
      <p
        style={{
          fontSize: "var(--fs-lg)",
          color: "var(--ink-dim)",
          maxWidth: 480,
          lineHeight: "var(--lh-normal)",
          marginBottom: "var(--space-6)",
        }}
      >
        Geobiom — это карта леса Ленобласти и календарь сезонов. Phase W3
        наполнит этот экран 3-step wizard'ом (геолокация → район → готово).
      </p>
      <button
        type="button"
        onClick={finish}
        className="btn-interactive"
        style={{
          padding: "var(--space-4) var(--space-5)",
          background: "var(--forest)",
          color: "var(--cream)",
          border: 0,
          borderRadius: "var(--radius-lg)",
          fontSize: "var(--fs-body)",
          fontWeight: 500,
          fontFamily: "var(--font-body)",
          cursor: "pointer",
          boxShadow: "0 8px 22px rgba(62,72,39,0.28)",
        }}
      >
        Открыть карту
      </button>
    </section>
  );
}
