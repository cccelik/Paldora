import styles from '@/components/ui/field.module.css';
import {
  type InputHTMLAttributes,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
interface FieldFrame {
  label: string;
  /** Becomes the control's ID and the base of its description ID. */
  id: string;
  help?: string;
  optional?: boolean;
  prefix?: string;
  /** Error message: danger border, the message below, `aria-invalid` on the control. */
  error?: string;
}

/** The `aria-describedby` value: help first, then the error. */
function describedBy(id: string, help?: string, error?: string) {
  const ids = [help ? `${id}-help` : '', error ? `${id}-error` : ''].filter(
    Boolean,
  );
  return ids.length > 0 ? ids.join(' ') : undefined;
}

function Frame({
  label,
  id,
  help,
  optional,
  prefix,
  readOnly,
  error,
  children,
}: FieldFrame & { readOnly?: boolean | undefined; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional ? <span className={styles.optional}>Optional</span> : null}
      </label>
      <div
        className={`${styles.control} ${readOnly ? styles.readOnly : ''}`}
        data-invalid={error ? 'true' : undefined}
      >
        {prefix ? (
          <span className={styles.prefix} aria-hidden="true">
            {prefix}
          </span>
        ) : null}
        {children}
      </div>
      {help ? (
        <p className={styles.help} id={`${id}-help`}>
          {help}
        </p>
      ) : null}
      {error ? (
        <p className={styles.error} id={`${id}-error`}>
          {error}
        </p>
      ) : null}
    </div>
  );
}

type InputFieldProps = FieldFrame &
  Omit<InputHTMLAttributes<HTMLInputElement>, 'id' | 'prefix'>;

/** A labelled input with optional help text, wired for screen readers. */
export function TextField({
  label,
  id,
  help,
  optional,
  prefix,
  error,
  ...input
}: InputFieldProps) {
  return (
    <Frame
      label={label}
      id={id}
      readOnly={input.readOnly}
      {...(error ? { error } : {})}
      {...(help ? { help } : {})}
      {...(optional ? { optional } : {})}
      {...(prefix ? { prefix } : {})}
    >
      <input
        id={id}
        aria-describedby={describedBy(id, help, error)}
        aria-invalid={error ? true : undefined}
        {...input}
      />
    </Frame>
  );
}

type AreaFieldProps = FieldFrame &
  Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id' | 'prefix'> & {
    /** React 19 passes `ref` as an ordinary prop. */
    ref?: Ref<HTMLTextAreaElement>;
  };

export function TextAreaField({
  label,
  id,
  help,
  optional,
  error,
  ...textarea
}: AreaFieldProps) {
  return (
    <Frame
      label={label}
      id={id}
      {...(error ? { error } : {})}
      {...(help ? { help } : {})}
      {...(optional ? { optional } : {})}
    >
      <textarea
        id={id}
        aria-describedby={describedBy(id, help, error)}
        aria-invalid={error ? true : undefined}
        {...textarea}
      />
    </Frame>
  );
}
