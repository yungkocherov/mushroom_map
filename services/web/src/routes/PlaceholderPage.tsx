/**
 * Разделы которые ещё не наполнены контентом. Общий компонент вместо
 * копипасты.
 *
 * На Фазе 1 карта маршрутов зарезервирована; содержательное наполнение
 * (каталог видов из species_registry, гайды, методология) — в следующих
 * фазах, когда под них будет отдельная разметка.
 */
import { Link } from "react-router-dom";

interface Props {
  title: string;
  description: string;
}

export function PlaceholderPage({ title, description }: Props) {
  return (
    <article className="content content--narrow">
      <h1>{title}</h1>
      <p className="lead">{description}</p>
      <div className="placeholder-box">
        <p>
          Раздел в работе. Пока что — пользуйтесь{" "}
          <Link to="/map">картой</Link>, она уже содержит все лесные
          данные Ленобласти.
        </p>
      </div>
    </article>
  );
}
