import styles from "./Badge.module.css";

type Props = {
  children: React.ReactNode;
  variant?: "default" | "accent" | "success" | "warning" | "danger";
  className?: string;
};

export function Badge({ children, variant = "default", className }: Props) {
  const cls = [
    styles.badge,
    variant !== "default" ? styles[variant] : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <span className={cls}>{children}</span>;
}
