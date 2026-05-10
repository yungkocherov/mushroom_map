import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Wordmark } from "../components/Wordmark";
import {
  setOnboarded,
  setPostAuthRedirect,
} from "../lib/onboardingStorage";
import { usePageTitle } from "../lib/usePageTitle";
import styles from "./OnboardingPage.module.css";

/**
 * Onboarding — `/onboarding`. 4-step wizard:
 *   1. Приветствие — что такое Geobiom.
 *   2. Слой «Породы» — как включить + что значат цвета.
 *   3. Другие важные слои — бонитет, возраст, болота, водотоки.
 *   4. Сохранённые места — требуют входа; 3 кнопки: «Войти»,
 *      «Войду позже» (skip без логина), «Назад».
 *
 * После любого варианта прохождения step 4 — `setOnboarded()` +
 * редирект на `/map`. При выборе «Войти» дополнительно
 * `setPostAuthRedirect('/map')` чтобы AuthCompletePage вернул юзера
 * на карту, а не на /cabinet.
 */

const TOTAL_STEPS = 4;

// Цвета синхронизированы с apps/web/src/lib/forestStyle.ts FOREST_COLORS —
// палитра коры дерева, как реально на карте.
const FOREST_SPECIES = [
  { name: "Сосна",  color: "#8b5a34" },
  { name: "Ель",    color: "#3e2e1c" },
  { name: "Берёза", color: "#c8b890" },
  { name: "Осина",  color: "#9ea48c" },
] as const;

const SECONDARY_LAYERS = [
  {
    name: "Бонитет",
    sub: "качество древостоя",
    body: "От I («отлично», богатая почва) до IV («слабо», скудная). Чем выше класс — тем лучше условия для роста леса.",
  },
  {
    name: "Возраст",
    sub: "возрастные группы",
    body: "От молодняка (<20 лет) до перестойного (>120 лет). Группы помогают понять, давно ли стоит лес и в какой он стадии.",
  },
  {
    name: "Болота",
    sub: "верховые и низинные",
    body: "Заболоченные участки. По краям — ягодные зоны (клюква, морошка), в центре обычно мхи и сфагнум.",
  },
  {
    name: "Водотоки",
    sub: "реки, ручьи, канавы",
    body: "Близость воды задаёт влажность почвы вокруг. Около ручьёв и низин лес сырой — другие условия для грибов.",
  },
] as const;

export function OnboardingPage() {
  usePageTitle("Привет, грибник — Geobiom");
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);

  const finishAndOpenMap = () => {
    setOnboarded();
    navigate("/map", { replace: true });
  };

  const finishAndLogin = () => {
    setOnboarded();
    setPostAuthRedirect("/map");
    navigate("/auth?next=/map");
  };

  return (
    <div className={styles.root}>
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

      <div className={styles.topBar}>
        <Wordmark size="md" />
        <div className={styles.stepper}>
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map((s, i) => (
            <span key={s} className={styles.stepperGroup}>
              <span
                className={`${styles.stepDot}${s <= step ? ` ${styles.stepDotActive}` : ""}`}
              >
                {s}
              </span>
              {i < TOTAL_STEPS - 1 && (
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
              onBack={() => setStep(1)}
              onContinue={() => setStep(3)}
            />
          )}
          {step === 3 && (
            <Step3
              onBack={() => setStep(2)}
              onContinue={() => setStep(4)}
            />
          )}
          {step === 4 && (
            <Step4
              onBack={() => setStep(3)}
              onLogin={finishAndLogin}
              onSkip={finishAndOpenMap}
            />
          )}
        </div>

        <div className={styles.bodyRight}>
          <div className={styles.cameo}>
            <CameoMap />
            <div className={styles.cameoFooter}>
              <span>Ленобласть · обзор</span>
              <span>z 7.2</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ───── Step components ─────────────────────────────────────────────

function Step1({ onContinue }: { onContinue: () => void }) {
  return (
    <>
      <div className={styles.crumb}>шаг 1 · знакомство</div>
      <h1 className={styles.headline}>
        Добро пожаловать на{" "}
        <em className={styles.headlineEm}>Geobiom</em>
      </h1>
      <p className={styles.lead}>
        Geobiom — это карта леса, почвы и водоёмов Ленобласти. Сейчас мы
        коротко расскажем о функционале нашего сервиса.
      </p>
      <p className={styles.leadCompact}>
        Это займёт меньше минуты.
      </p>
      <div className={styles.ctaRow}>
        <button
          type="button"
          onClick={onContinue}
          className={`${styles.btn} ${styles.btnPrimary} btn-interactive`}
        >
          Дальше
        </button>
      </div>
    </>
  );
}

function Step2({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <div className={styles.crumb}>шаг 2 · породы леса</div>
      <h1 className={styles.headlineCompact}>
        Сначала <em className={styles.headlineEm}>включи породы</em>
      </h1>
      <p className={styles.leadCompact}>
        В панели слева на карте — секция <strong>«Лес»</strong> с чипом
        «Породы». Включи его — карта раскрасится по преобладающей породе
        леса в каждом выделе.
      </p>
      <div className={styles.swatches}>
        {FOREST_SPECIES.map((s) => (
          <span key={s.name} className={styles.swatchItem}>
            <span
              className={styles.swatchDot}
              style={{ background: s.color }}
              aria-hidden="true"
            />
            {s.name}
          </span>
        ))}
      </div>
      <p className={styles.leadCompact}>
        Так сразу видно, где сосновый бор, где ельник, а где смешанный
        лес — три разных биотопа с разными грибами.
      </p>
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

function Step3({
  onBack,
  onContinue,
}: {
  onBack: () => void;
  onContinue: () => void;
}) {
  return (
    <>
      <div className={styles.crumb}>шаг 3 · другие слои</div>
      <h1 className={styles.headlineCompact}>
        Что ещё <em className={styles.headlineEm}>смотрим</em>
      </h1>
      <p className={styles.leadCompact}>
        Кроме пород на карте есть ещё четыре важных слоя — переключаются
        в той же левой панели:
      </p>
      <ul className={styles.layerList}>
        {SECONDARY_LAYERS.map((l) => (
          <li key={l.name} className={styles.layerItem}>
            <div className={styles.layerHead}>
              <span className={styles.layerName}>{l.name}</span>
              <span className={styles.layerSub}>{l.sub}</span>
            </div>
            <p className={styles.layerBody}>{l.body}</p>
          </li>
        ))}
      </ul>
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

function Step4({
  onBack,
  onLogin,
  onSkip,
}: {
  onBack: () => void;
  onLogin: () => void;
  onSkip: () => void;
}) {
  return (
    <>
      <div className={styles.crumb}>шаг 4 · сохранённые места</div>
      <h1 className={styles.headline}>
        Сохрани свои <em className={styles.headlineEm}>точки</em>
      </h1>
      <p className={styles.lead}>
        Любимые поляны, удачные находки, тайные маршруты — отмечай прямо
        на карте, и они останутся на твоём аккаунте между визитами.
        Видны только тебе.
      </p>
      <p className={styles.leadCompact}>
        Войти можно любым удобным способом.
      </p>
      <div className={styles.ctaRow}>
        <button
          type="button"
          onClick={onLogin}
          className={`${styles.btn} ${styles.btnPrimary} btn-interactive`}
        >
          Войти
        </button>
        <button
          type="button"
          onClick={onSkip}
          className={`${styles.btn} ${styles.btnGhost} btn-interactive`}
        >
          Войду позже
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

// ───── Cameo (placeholder, share with future real-map preview) ─────

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
