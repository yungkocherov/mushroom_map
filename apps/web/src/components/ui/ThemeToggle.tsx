import { useEffect, useState } from "react";
import { Sun, Moon } from "lucide-react";
import styles from "./ThemeToggle.module.css";

type Theme = "light" | "dark";

function readStoredTheme(): Theme | null {
  try {
    const value = localStorage.getItem("theme");
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function resolveInitialTheme(): Theme {
  const stored = readStoredTheme();
  if (stored) return stored;
  if (typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

/**
 * Light/dark toggle. The pre-hydrate script in index.html has already
 * set `data-theme` on <html> from localStorage, so we start in the
 * right state without a flash. This component syncs React's idea of
 * the theme and toggles the attribute on click.
 */
export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => resolveInitialTheme());

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("theme", theme);
    } catch {
      // ignore — private browsing or disabled storage
    }
  }, [theme]);

  const next: Theme = theme === "light" ? "dark" : "light";
  const label = next === "dark" ? "Переключить на тёмную тему" : "Переключить на светлую тему";

  return (
    <button
      type="button"
      className={styles.button}
      aria-label={label}
      title={label}
      onClick={() => setTheme(next)}
    >
      {theme === "light" ? <Sun size={18} aria-hidden /> : <Moon size={18} aria-hidden />}
    </button>
  );
}
