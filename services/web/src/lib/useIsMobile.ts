import { useEffect, useState } from "react";

/**
 * Возвращает true если окно меньше `breakpoint` пикселей по ширине.
 * Подписан на resize — компонент перерендерится при повороте/изменении.
 *
 * Используется для адаптива контролов: на мобильном делаем кнопки крупнее
 * (touch target >= 40px), скрываем мышиные подсказки, прячем подсказки
 * и т.д.
 */
export function useIsMobile(breakpoint = 600): boolean {
  const [mobile, setMobile] = useState(() =>
    typeof window !== "undefined" && window.innerWidth < breakpoint,
  );

  useEffect(() => {
    const onResize = () => setMobile(window.innerWidth < breakpoint);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [breakpoint]);

  return mobile;
}
