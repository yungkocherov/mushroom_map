import type { ReactNode } from "react";
import { Info, AlertTriangle, BookOpen } from "lucide-react";
import styles from "./Callout.module.css";

type CalloutType = "info" | "warn" | "note";

interface Props {
  type?: CalloutType;
  title?: string;
  children: ReactNode;
}

const ICONS: Record<CalloutType, typeof Info> = {
  info: Info,
  warn: AlertTriangle,
  note: BookOpen,
};

export function Callout({ type = "info", title, children }: Props) {
  const Icon = ICONS[type];
  return (
    <aside className={`${styles.callout} ${styles[type]}`} role="note">
      <Icon size={18} className={styles.icon} aria-hidden />
      <div className={styles.body}>
        {title ? <p className={styles.title}>{title}</p> : null}
        <div className={styles.content}>{children}</div>
      </div>
    </aside>
  );
}
