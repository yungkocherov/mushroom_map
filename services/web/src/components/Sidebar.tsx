export function Sidebar() {
  return (
    <aside className="sidebar">
      <header className="sidebar__header">
        <h1>mushroom-map</h1>
        <p className="sidebar__subtitle">Грибная карта Ленобласти</p>
      </header>

      {/* TODO phase 2:
          - фильтр сезона (слайдер месяц)
          - поиск вида
          - выбор региона
          - источник данных (OSM / Copernicus)
      */}

      <section className="sidebar__filters">
        <p className="placeholder">Фильтры появятся в phase 2</p>
      </section>
    </aside>
  );
}
