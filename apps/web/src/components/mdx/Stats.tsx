import styles from "./Stats.module.css";

interface Stat {
  number: string;
  label: string;
  hint?: string;
}

interface Props {
  stats: Stat[];
}

export function Stats({ stats }: Props) {
  return (
    <div className={styles.row} role="list">
      {stats.map((s, i) => (
        <div key={i} className={styles.cell} role="listitem">
          <div className={styles.number}>{s.number}</div>
          <div className={styles.label}>{s.label}</div>
          {s.hint ? <div className={styles.hint}>{s.hint}</div> : null}
        </div>
      ))}
    </div>
  );
}
