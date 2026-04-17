export function AboutPage() {
  return (
    <article className="content content--narrow">
      <h1>Об авторе</h1>
      <p className="lead">
        Проект делает один человек, как хобби. Мотивация простая:
        хотелось объединить данные из разрозненных источников (Рослесхоз,
        OSM, ботанические справочники) в одно место, которым удобно
        пользоваться в лесу.
      </p>

      <h2>Почему карта</h2>
      <p>
        Большинство грибных ресурсов рунета — это либо форумы без
        структурированных данных, либо мобильные приложения с распознаванием
        по фото (которому не стоит доверять, когда речь о съедобности).
        Ни там, ни там нет ответа на базовый вопрос: <em>«где здесь
        растёт то, что я ищу»</em>. Карта с лесохозяйственными данными
        — попытка закрыть этот пробел.
      </p>

      <h2>Что дальше</h2>
      <p>
        Список планов и идей — в{" "}
        <a
          href="https://github.com/yungkocherov/mushroom_map/blob/main/docs/roadmap_content_ideas.md"
          target="_blank"
          rel="noreferrer"
        >
          roadmap
        </a>
        . Если что-то хочется увидеть раньше или есть замечание — пишите
        через issues на{" "}
        <a
          href="https://github.com/yungkocherov/mushroom_map"
          target="_blank"
          rel="noreferrer"
        >
          GitHub
        </a>
        .
      </p>

      <h2>Технологии</h2>
      <p>
        PostGIS, FastAPI, React + MapLibre GL, PMTiles. Весь код открытый,
        данные — public domain / OSM / ФГИС ЛК. Никакой телеметрии,
        никакой рекламы.
      </p>
    </article>
  );
}
