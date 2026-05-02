import { Code, Mail } from "lucide-react";
import { Link } from "react-router-dom";
import styles from "./Footer.module.css";

export function Footer() {
  return (
    <footer className={styles.footer}>
      <div className={styles.inner}>
        <div className={styles.col}>
          <p className={styles.note}>
            Geobiom — открытый некоммерческий проект про лес Ленобласти.
            Данные: Рослесхоз / ФГИС ЛК, OSM, Copernicus DEM, Докучаевский
            почвенный институт, агрегаты ВК-сообществ.
          </p>
        </div>
        <nav className={styles.linksCol} aria-label="Ссылки">
          <Link to="/methodology" className={styles.link}>Методология</Link>
          <Link to="/legal/privacy" className={styles.link}>Конфиденциальность</Link>
          <Link to="/legal/terms" className={styles.link}>Условия</Link>
        </nav>
        <div className={styles.iconsCol}>
          <a
            href="https://github.com/yungkocherov/mushroom_map"
            className={styles.iconLink}
            target="_blank"
            rel="noreferrer"
            aria-label="Исходный код на GitHub"
          >
            <Code size={20} />
          </a>
          <a
            href="mailto:ikocherov@mail.ru"
            className={styles.iconLink}
            aria-label="Написать автору"
          >
            <Mail size={20} />
          </a>
        </div>
      </div>
    </footer>
  );
}
