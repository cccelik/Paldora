import type { ButtonHTMLAttributes } from 'react';
import styles from './button.module.css';

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
