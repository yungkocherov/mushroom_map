import type { ReactNode } from "react";
import styles from "./TLDR.module.css";

interface Props {
  children: ReactNode;
}

export function TLDR({ children }: Props) {
  return (
    <aside className={styles.box} aria-label="Краткая сводка">
      <p className={styles.label}>TL;DR</p>
      <div className={styles.body}>{children}</div>
    </aside>
  );
}
