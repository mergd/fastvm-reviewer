import styles from "./Card.module.css";

type Props = {
  children: React.ReactNode;
  className?: string;
};

export function Card({ children, className }: Props) {
  const cls = [styles.card, className].filter(Boolean).join(" ");
  return <div className={cls}>{children}</div>;
}

Card.Label = function CardLabel({ children }: { children: React.ReactNode }) {
  return <div className={styles.label}>{children}</div>;
};

Card.Value = function CardValue({ children }: { children: React.ReactNode }) {
  return <div className={styles.value}>{children}</div>;
};
