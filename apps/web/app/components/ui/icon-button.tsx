import styles from '@/components/ui/icon-button.module.css';
import { type ButtonHTMLAttributes, type ReactNode, type Ref } from 'react';
/** Class names for a link that should look like an `IconButton`. */
export function iconButtonClassName(
  kind: 'surface' | 'primary' | 'plain' = 'surface',
  size: 40 | 52 = 40,
): string {
  return [styles.button, styles[kind], styles[`size-${size}`]].join(' ');
}

/**
 * Figma "Icon button" (43:125): Surface, Primary, Plain at 40 or 52. The
 * label is required because the button has no visible text.
 */
export function IconButton({
  label,
  kind = 'surface',
  size = 40,
  className,
  type = 'button',
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'aria-label'> & {
  label: string;
  kind?: 'surface' | 'primary' | 'plain';
  size?: 40 | 52;
  /** An `Icon`. */
  children: ReactNode;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type={type}
      aria-label={label}
      className={[
        styles.button,
        styles[kind],
        styles[`size-${size}`],
        className,
      ]
        .filter(Boolean)
        .join(' ')}
      {...props}
    >
      {children}
    </button>
  );
}
