import type { ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import styles from "./Card.module.css";

interface CommonProps {
  children: ReactNode;
  className?: string;
  /** Render as a link to a route. */
  to?: LinkProps["to"];
  /** Render as an external anchor. */
  href?: string;
}

export function Card({ children, className = "", to, href }: CommonProps) {
  const cls = `${styles.card} ${(to || href) ? styles.interactive : ""} ${className}`.trim();
  if (to !== undefined) {
    return (
      <Link to={to} className={cls}>
        {children}
      </Link>
    );
  }
  if (href !== undefined) {
    return (
      <a href={href} className={cls} target="_blank" rel="noreferrer">
        {children}
      </a>
    );
  }
  return <div className={cls}>{children}</div>;
}
