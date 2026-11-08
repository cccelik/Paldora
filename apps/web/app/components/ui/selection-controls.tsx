import styles from '@/components/ui/selection-controls.module.css';
import { type InputHTMLAttributes, type ReactNode } from 'react';
type ControlProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
> & {
  label: ReactNode;
  /** Hides the visible label but keeps it for assistive technology. */
  labelHidden?: boolean;
};

type InputOnlyProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
>;

/** The bare control, for rows that supply their own label (`ListRow`). */
export function ToggleInput(props: InputOnlyProps) {
  return (
    <input type="checkbox" role="switch" className={styles.toggle} {...props} />
  );
}

export function RadioInput(props: InputOnlyProps) {
  return <input type="radio" className={styles.radio} {...props} />;
}

export function CheckboxInput(props: InputOnlyProps) {
  return <input type="checkbox" className={styles.checkbox} {...props} />;
}

function Row({
  kind,
  label,
  labelHidden,
  className,
  ...input
}: ControlProps & { kind: 'toggle' | 'radio' | 'checkbox' }) {
  return (
    <label className={`${styles.row} ${className ?? ''}`}>
      <input
        type={kind === 'radio' ? 'radio' : 'checkbox'}
        role={kind === 'toggle' ? 'switch' : undefined}
        className={styles[kind]}
        {...input}
      />
      <span className={labelHidden ? 'visually-hidden' : styles.label}>
        {label}
      </span>
    </label>
  );
}

/** Figma "Toggle" (43:198): a 46x28 switch, brass when on. */
export function Toggle(props: ControlProps) {
  return <Row kind="toggle" {...props} />;
}

/** Figma "Radio" (43:205): 22px, brass ring when selected. */
export function Radio(props: ControlProps) {
  return <Row kind="radio" {...props} />;
}

/** Figma "Checkbox" (43:214): 22px, radius 7, brass when checked. */
export function Checkbox(props: ControlProps) {
  return <Row kind="checkbox" {...props} />;
}
