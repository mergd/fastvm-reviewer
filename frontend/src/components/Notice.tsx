import styles from "./Notice.module.css";

type Props = {
  children: React.ReactNode;
  variant?: "default" | "warning" | "error" | "success";
  className?: string;
};

export function Notice({ children, variant = "default", className }: Props) {
  const cls = [
    styles.notice,
    variant !== "default" ? styles[variant] : undefined,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <div className={cls}>{children}</div>;
}
