import type { ReactNode } from "react";
import styles from "./KeyFacts.module.css";

interface Fact {
  label: string;
  value: ReactNode;
}

interface Props {
  facts: Fact[];
  title?: string;
}

export function KeyFacts({ facts, title }: Props) {
  return (
    <section className={styles.box} aria-label={title ?? "Ключевые факты"}>
      {title ? <p className={styles.title}>{title}</p> : null}
      <dl className={styles.list}>
        {facts.map((f, i) => (
          <div key={i} className={styles.row}>
            <dt className={styles.label}>{f.label}</dt>
            <dd className={styles.value}>{f.value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
