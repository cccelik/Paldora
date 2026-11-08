import styles from '@/components/ui/button.module.css';
import { type ButtonHTMLAttributes, type Ref } from 'react';
/**
 * Figma "Button" (43:98). `quiet` is the established text-link button; the
 * rest are the Figma kinds: Primary, Secondary, Accent (brass), Ghost, Danger.
 */
export type ButtonVariant =
  'primary' | 'secondary' | 'accent' | 'ghost' | 'quiet' | 'danger';
/** Figma sizes L 56, M 48, S 36 (S keeps a 44px hit area). */
export type ButtonSize = 'l' | 'm' | 's';

/** Class names for anything that should look like a button (links too). */
export function buttonClassName(
  variant: ButtonVariant = 'primary',
  options: { block?: boolean; size?: ButtonSize } = {},
): string {
  return [
    styles.button,
    styles[variant],
    styles[`size-${options.size ?? 'm'}`],
    options.block ? styles.block : '',
  ]
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  block?: boolean;
  /** Shows the in-button spinner (the only spinner Paldora allows) and blocks presses. */
  loading?: boolean;
  /** React 19 passes `ref` as an ordinary prop. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  size = 'm',
  block = false,
  loading = false,
  className,
  type = 'button',
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[buttonClassName(variant, { block, size }), className]
        .filter(Boolean)
        .join(' ')}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      data-loading={loading || undefined}
      {...props}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {children}
    </button>
  );
}
