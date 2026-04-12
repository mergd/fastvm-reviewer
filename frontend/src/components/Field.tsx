import { CaretDown } from "@phosphor-icons/react";
import { Field as BaseField } from "@base-ui/react/field";
import { Input } from "@base-ui/react/input";
import type { ChangeEvent } from "react";
import styles from "./Field.module.css";

type BaseProps = {
  id?: string;
  label: string;
  className?: string;
};

type InputFieldProps = BaseProps & {
  type?: "input";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

type TextareaFieldProps = BaseProps & {
  type: "textarea";
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
};

type SelectFieldProps = BaseProps & {
  type: "select";
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
  disabled?: boolean;
};

type Props = InputFieldProps | TextareaFieldProps | SelectFieldProps;

export function Field({ id, label, className, ...props }: Props) {
  return (
    <BaseField.Root className={[styles.root, className].filter(Boolean).join(" ")}>
      <BaseField.Label htmlFor={id} className={styles.label}>
        {label}
      </BaseField.Label>
      {props.type === "textarea" ? (
        <textarea
          id={id}
          className={styles.textarea}
          value={props.value}
          onChange={(e: ChangeEvent<HTMLTextAreaElement>) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
        />
      ) : props.type === "select" ? (
        <div className={styles.selectWrapper}>
          <select
            id={id}
            className={styles.select}
            value={props.value}
            onChange={(e: ChangeEvent<HTMLSelectElement>) => props.onChange(e.target.value)}
            disabled={props.disabled}
          >
            {props.children}
          </select>
          <CaretDown size={12} className={styles.selectIcon} weight="bold" />
        </div>
      ) : (
        <Input
          id={id}
          className={styles.input}
          value={props.value}
          onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
          placeholder={props.placeholder}
          disabled={props.disabled}
        />
      )}
      <BaseField.Error className={styles.error} />
    </BaseField.Root>
  );
}
