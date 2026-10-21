import styles from '@/components/ui/button.module.css';
import { type ButtonHTMLAttributes, type Ref } from 'react';
export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

/** Class names for anything that should look like a button (links too). */
export function buttonClassName(
  variant: ButtonVariant = 'primary',
  options: { block?: boolean } = {},
): string {
  return [styles.button, styles[variant], options.block ? styles.block : '']
    .filter(Boolean)
    .join(' ');
}

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  block?: boolean;
  /** React 19 passes `ref` as an ordinary prop. */
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = 'primary',
  block = false,
  className,
  type = 'button',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={[buttonClassName(variant, { block }), className]
        .filter(Boolean)
        .join(' ')}
      {...props}
    />
  );
}
