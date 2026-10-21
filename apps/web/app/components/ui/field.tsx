import {
  type InputHTMLAttributes,
  type Ref,
  type TextareaHTMLAttributes,
} from 'react';
import styles from './field.module.css';
interface FieldFrame {
  label: string;
  /** Becomes the control's ID and the base of its description ID. */
  id: string;
  help?: string;
  optional?: boolean;
  prefix?: string;
}

function Frame({
  label,
  id,
  help,
  optional,
  prefix,
  readOnly,
  children,
}: FieldFrame & { readOnly?: boolean | undefined; children: React.ReactNode }) {
  return (
    <div className={styles.field}>
      <label className={styles.label} htmlFor={id}>
        {label}
        {optional ? <span className={styles.optional}>Optional</span> : null}
      </label>
      <div className={`${styles.control} ${readOnly ? styles.readOnly : ''}`}>
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
  ...input
}: InputFieldProps) {
  return (
    <Frame
      label={label}
      id={id}
      readOnly={input.readOnly}
      {...(help ? { help } : {})}
      {...(optional ? { optional } : {})}
      {...(prefix ? { prefix } : {})}
    >
      <input
        id={id}
        aria-describedby={help ? `${id}-help` : undefined}
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
  ...textarea
}: AreaFieldProps) {
  return (
    <Frame
      label={label}
      id={id}
      {...(help ? { help } : {})}
      {...(optional ? { optional } : {})}
    >
      <textarea
        id={id}
        aria-describedby={help ? `${id}-help` : undefined}
        {...textarea}
      />
    </Frame>
  );
}
