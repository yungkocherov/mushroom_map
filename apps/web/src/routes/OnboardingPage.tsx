import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wordmark } from "../components/Wordmark";
import { Pill } from "../components/Pill";
import { PulsePin } from "../components/PulsePin";
import { setOnboarded } from "../lib/onboardingStorage";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./OnboardingPage.module.css";

/**
 * Onboarding — `/onboarding`. Phase W3 full port of D1VOnboarding.
 * Source: docs/redesign-2026-05/claude-design/src/d1v2-suite.jsx:314-411
 *
 * 3-step wizard:
 *   1. Геолокация — "Привет, грибник." + 2 кнопки
 *   2. Район — pill-list из ЛО-районов
 *   3. Готово — 4 feature cards + "Открыть карту"
 *
 * После step 3 ставится `localStorage.geobiom_onboarded = "1"` через
 * `setOnboarded()` и редирект на `/`.
 */

const DISTRICTS_FIRST_TWELVE = [
  "Всеволожский",
  "Приозерский",
  "Выборгский",
  "Лужский",
  "Гатчинский",
  "Тосненский",
  "Кировский",
  "Волховский",
  "Лодейнопольский",
  "Подпорожский",
  "Тихвинский",
  "Бокситогорский",
];

const FEATURE_CARDS = [
  ["Виды",      "25 в каталоге"],
  ["Споты",     "твоё личное"],
  ["Индекс",    "прогноз 72ч"],
  ["Календарь", "сезон по месяцам"],
] as const;

export function OnboardingPage() {
  usePageTitle("Привет, грибник — Geobiom");
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [district, setDistrict] = useState<string>("Всеволожский");

  const finish = () => {
    setOnboarded();
    navigate("/", { replace: true });
  };

  return (
    <div className={styles.root}>
      {/* Decorative contour wash, same family as Landing. */}
      <svg
        className={styles.wash}
        viewBox="0 0 1280 800"
        preserveAspectRatio="none"
        aria-hidden="true"
      >
        <g fill="none" stroke="var(--bark)" strokeWidth={0.7}>
          {Array.from({ length: 14 }).map((_, i) => (
            <path
              key={i}
              d={`M-50 ${120 + i * 48} Q 320 ${100 + i * 46}, 640 ${130 + i * 48} T 1330 ${110 + i * 46}`}
            />
          ))}
        </g>
      </svg>

      {/* Top bar — wordmark + stepper. Layout's Header is hidden via root class. */}
      <div className={styles.topBar}>
        <Wordmark size="md" />
        <div className={styles.stepper}>
          {[1, 2, 3].map((s, i) => (
            <span key={s} className={styles.stepperGroup}>
              <span
                className={`${styles.stepDot}${s <= step ? ` ${styles.stepDotActive}` : ""}`}
              >
                {s}
              </span>
              {i < 2 && (
                <span
                  className={`${styles.stepLine}${s < step ? ` ${styles.stepLineActive}` : ""}`}
                />
              )}
            </span>
          ))}
        </div>
      </div>

      <div className={styles.body}>
        <div className={styles.bodyLeft} key={step}>
          {step === 1 && <Step1 onContinue={() => setStep(2)} />}
          {step === 2 && (
            <Step2
              district={district}
              setDistrict={setDistrict}
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && <Step3 district={district} onFinish={finish} />}
        </div>

        {/* Right cameo — pins appear progressively */}
        <div className={styles.bodyRight}>
          <div className={styles.cameo}>
            <CameoMap />
            {step >= 2 && (
              <div className={styles.pin1}>
                <PulsePin color="var(--chanterelle)" size={14} />
              </div>
            )}
            {step === 3 && (
              <div className={styles.pin2}>
                <PulsePin color="var(--moss)" size={11} delay={0.4} />
              </div>
            )}
            <div className={styles.cameoFooter}>
              <span>{district}</span>
              <span>z 8.4</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Step1({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <div className={styles.crumb}>шаг 1 · знакомство</div>
      <h1 className={styles.headline}>Привет, грибник.</h1>
      <p className={styles.lead}>
        Geobiom — это карта леса Ленобласти и календарь сезонов. Чтобы начать,
        разреши доступ к геолокации — мы покажем, что растёт{" "}
        <em className={styles.handAccent}>рядом с тобой</em>.
      </p>
      <div className={styles.ctaRow}>
        <button
          type="button"
          onClick={onContinue}
          className={`${styles.btn} ${styles.btnPrimary} btn-interactive`}
        >
          Разрешить геолокацию
        </button>
        <button
          type="button"
          onClick={onContinue}
          className={`${styles.btn} ${styles.btnGhost} btn-interactive`}
        >
          Выбрать вручную
        </button>
      </div>
    </>
  );
}

function Step2({
  district,
  setDistrict,
  onBack,
  onContinue,
}: {
  district: string;
  setDistrict: (s: string) => void;
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <div className={styles.crumb}>шаг 2 · район</div>
      <h1 className={styles.headlineCompact}>
        Где ты <em className={styles.headlineEm}>обычно</em> ходишь в лес?
      </h1>
      <p className={styles.leadCompact}>
        Подберём индекс плодоношения и виды, типичные для района. Можно
        поменять в любой момент.
      </p>
      <div className={styles.pillRow}>
        {DISTRICTS_FIRST_TWELVE.map((d) => (
          <Pill
            key={d}
            on={district === d}
            onToggle={() => setDistrict(d)}
            ariaLabel={`Выбрать район ${d}`}
          >
            {d}
          </Pill>
        ))}
      </div>
      <div className={styles.ctaRow}>
        <button
          type="button"
          onClick={onContinue}
          className={`${styles.btn} ${styles.btnPrimary} btn-interactive`}
        >
          Дальше
        </button>
        <button
          type="button"
          onClick={onBack}
          className={`${styles.btn} ${styles.btnText} btn-interactive`}
        >
          ← назад
        </button>
      </div>
    </>
  );
}

function Step3({ district, onFinish }: { district: string; onFinish: () => void }) {
  return (
    <>
      <div className={styles.crumb}>шаг 3 · готово</div>
      <h1 className={styles.headline}>
        Всё, лес <em className={styles.headlineEm}>ждёт</em>.
      </h1>
      <p className={styles.lead}>
        Сейчас откроется карта <strong>{district}</strong> района. Можешь сразу
        отметить любимый спот — кнопкой <span className={styles.cta}>+ место</span>{" "}
        в правом нижнем углу.
      </p>
      <div className={styles.featureGrid}>
        {FEATURE_CARDS.map(([title, sub]) => (
          <div key={title} className={styles.featureCard}>
            <div className={styles.featureTitle}>{title}</div>
            <div className={styles.featureSub}>{sub}</div>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={onFinish}
        className={`${styles.btn} ${styles.btnPrimary} btn-interactive`}
      >
        Открыть карту
      </button>
    </>
  );
}

function CameoMap() {
  return (
    <svg
      viewBox="0 0 400 500"
      preserveAspectRatio="xMidYMid slice"
      className={styles.cameoSvg}
      aria-hidden="true"
    >
      <rect x={0} y={0} width={400} height={500} fill="#ede1c8" />
      <path d="M0 175 C 60 200, 100 275, 72 350 L 0 425 Z" fill="#a9bccc" />
      <path d="M400 25 L 312 25 C 328 90, 368 110, 400 140 Z" fill="#a9bccc" />
      <path
        d="M20 25 C 120 0, 180 75, 220 25 L 220 160 C 160 180, 80 200, 20 160 Z"
        fill="#7d8e5a"
      />
      <path d="M220 25 C 260 90, 280 125, 312 25 Z" fill="#5e7042" />
      <path
        d="M120 225 C 200 200, 280 250, 312 210 L 340 300 C 280 350, 160 360, 100 310 Z"
        fill="#5e7042"
      />
      <path
        d="M160 350 C 240 340, 312 390, 368 360 L 400 475 L 128 475 Z"
        fill="#7d8e5a"
      />
    </svg>
  );
}
