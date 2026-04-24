import type { ReactNode } from "react";
import styles from "./Container.module.css";

type ContainerSize = "default" | "narrow" | "wide";

interface ContainerProps {
  children: ReactNode;
  size?: ContainerSize;
  as?: keyof Pick<JSX.IntrinsicElements, "div" | "main" | "section" | "article">;
}

export function Container({ children, size = "default", as: Tag = "div" }: ContainerProps) {
  return <Tag className={`${styles.container} ${styles[size]}`}>{children}</Tag>;
}
