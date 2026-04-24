import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";
import styles from "./Button.module.css";

type Variant = "primary" | "ghost" | "subtle";
type Size = "md" | "sm";

interface CommonProps {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
  className?: string;
}

type ButtonAsButton = CommonProps & ButtonHTMLAttributes<HTMLButtonElement> & {
  as?: "button";
};

type ButtonAsLink = CommonProps & Omit<LinkProps, "children" | "className"> & {
  as: "link";
};

type ButtonAsAnchor = CommonProps & React.AnchorHTMLAttributes<HTMLAnchorElement> & {
  as: "a";
};

type Props = ButtonAsButton | ButtonAsLink | ButtonAsAnchor;

export function Button(props: Props) {
  const { variant = "primary", size = "md", children, className = "", ...rest } = props;
  const cls = `${styles.btn} ${styles[variant]} ${styles[size]} ${className}`.trim();

  if ("as" in rest && rest.as === "link") {
    const { as: _ignored, ...linkProps } = rest as ButtonAsLink;
    return (
      <Link {...linkProps} className={cls}>
        {children}
      </Link>
    );
  }
  if ("as" in rest && rest.as === "a") {
    const { as: _ignored, ...anchorProps } = rest as ButtonAsAnchor;
    return (
      <a {...anchorProps} className={cls}>
        {children}
      </a>
    );
  }
  const { as: _ignored, ...buttonProps } = rest as ButtonAsButton;
  return (
    <button {...buttonProps} className={cls}>
      {children}
    </button>
  );
}
