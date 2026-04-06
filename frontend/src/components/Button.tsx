import { Button as BaseButton } from "@base-ui/react/button";
import type { ButtonProps } from "@base-ui/react/button";
import styles from "./Button.module.css";

type Props = ButtonProps & {
  variant?: "primary" | "secondary" | "ghost";
  size?: "sm" | "md";
  href?: string;
};

export function Button({ variant = "secondary", size = "md", href, className, children, ...props }: Props) {
  const cls = [
    styles.btn,
    styles[variant],
    size === "sm" ? styles.sm : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (href) {
    return (
      <a href={href} className={cls}>
        {children}
      </a>
    );
  }

  return (
    <BaseButton {...props} className={cls}>
      {children}
    </BaseButton>
  );
}
