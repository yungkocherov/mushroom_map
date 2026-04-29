import type { ReactNode } from "react";
import styles from "./Steps.module.css";

interface Step {
  title: string;
  body: ReactNode;
}

interface Props {
  steps: Step[];
}

export function Steps({ steps }: Props) {
  return (
    <ol className={styles.list}>
      {steps.map((s, i) => (
        <li key={i} className={styles.item}>
          <div className={styles.num}>{i + 1}</div>
          <div className={styles.body}>
            <p className={styles.title}>{s.title}</p>
            <div className={styles.text}>{s.body}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}
