import { Container } from "../components/layout/Container";
import { Button } from "../components/ui/Button";
import { Card } from "../components/ui/Card";
import styles from "./HomePage.module.css";

/**
 * Главная — hero + быстрые точки входа в основные разделы. Hero/landing
 * наполнение Phase 1 заменит этот скелет (status widget «что сейчас
 * растёт», live counters, ротация сезонных фото). Сейчас — рабочий
 * минимум, чтобы перейти в карту в один клик.
 */
export function HomePage() {
  return (
    <Container as="article" size="default">
      <section className={styles.hero}>
        <h1 className={styles.title}>Грибная карта Ленобласти</h1>
        <p className={styles.lead}>
          Интерактивная карта лесов области с указанием пород, возраста
          и продуктивности. Опирается на официальные данные ФГИС ЛК
          (Рослесхоз) — около двух миллионов выделов, покрывающих всю
          область от Выборга до Тихвина.
        </p>
        <p className={styles.sub}>
          Для каждого полигона — клик показывает, какие виды грибов
          теоретически там встречаются, с учётом породы дерева, бонитета
          и возрастной группы.
        </p>
        <div className={styles.cta}>
          <Button as="link" to="/map" variant="primary">
            Открыть карту
          </Button>
          <Button as="link" to="/methodology" variant="ghost">
            Как собраны данные
          </Button>
        </div>
      </section>

      <section className={styles.grid}>
        <Card to="/species">
          <h3 className={styles.cardTitle}>Справочник видов</h3>
          <p className={styles.cardText}>
            Съедобность, сезон, в каких лесах водится, с чем можно спутать.
          </p>
        </Card>
        <Card to="/forecast">
          <h3 className={styles.cardTitle}>Прогноз плодоношения</h3>
          <p className={styles.cardText}>
            Ранжирование районов по предсказанной активности на ближайшую
            неделю.
          </p>
        </Card>
        <Card to="/guide">
          <h3 className={styles.cardTitle}>Полевые гайды</h3>
          <p className={styles.cardText}>
            Что брать с собой, когда ехать, где нельзя собирать,
            двойники ядовитых видов.
          </p>
        </Card>
        <Card to="/methodology">
          <h3 className={styles.cardTitle}>Методология</h3>
          <p className={styles.cardText}>
            Откуда данные, какие у них ограничения и чему не стоит доверять
            на 100%.
          </p>
        </Card>
      </section>
    </Container>
  );
}
