/**
 * Главная страница — hero + CTA → карта.
 *
 * Минимальное содержание на Фазе 1. Фаза 2 докрутит дизайн (fraunces,
 * бумажный фон и т.д.); сейчас — опорный текст и рабочая ссылка в
 * карту.
 */
import { Link } from "react-router-dom";

export function HomePage() {
  return (
    <article className="content">
      <section className="hero">
        <h1 className="hero__title">Грибная карта Ленобласти</h1>
        <p className="hero__lead">
          Интерактивная карта лесов области с указанием пород, возраста
          и продуктивности. Опирается на официальные данные ФГИС ЛК
          (Рослесхоз) — около двух миллионов выделов, покрывающих всю
          область от Выборга до Тихвина.
        </p>
        <p className="hero__sub">
          Для каждого полигона — клик по нему показывает, какие виды
          грибов теоретически там встречаются, с учётом породы дерева,
          бонитета и возрастной группы.
        </p>
        <div className="hero__cta">
          <Link to="/map" className="btn btn--primary">
            Открыть карту →
          </Link>
          <Link to="/methodology" className="btn btn--ghost">
            Как собраны данные
          </Link>
        </div>
      </section>

      <section className="home-grid">
        <Link to="/species" className="home-grid__card">
          <h3>Справочник видов</h3>
          <p>
            Съедобность, сезон, в каких лесах водится, с чем можно спутать.
          </p>
        </Link>
        <Link to="/guide" className="home-grid__card">
          <h3>Полевые гайды</h3>
          <p>
            Что брать с собой, когда ехать, где нельзя собирать,
            двойники ядовитых видов.
          </p>
        </Link>
        <Link to="/methodology" className="home-grid__card">
          <h3>Методология</h3>
          <p>
            Откуда данные, какие у них ограничения и чему не стоит доверять
            на 100%.
          </p>
        </Link>
      </section>
    </article>
  );
}
