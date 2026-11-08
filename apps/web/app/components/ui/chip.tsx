import styles from '@/components/ui/chip.module.css';
import { Icon, type IconName } from '@/components/ui/icons';
import { type ButtonHTMLAttributes, type ReactNode } from 'react';
/** Figma "Chip" (43:146): Default, Selected, Accent, Soft, Brass. */
export type ChipKind = 'default' | 'selected' | 'accent' | 'soft' | 'brass';
/** A 6px colour dot, for example a Box's colour. */
export type ChipDot = 'ember' | 'brass' | 'sage';

interface ChipOptions {
  kind?: ChipKind;
  icon?: IconName;
  dot?: ChipDot;
}

function classes(kind: ChipKind, extra?: string) {
  return [styles.chip, styles[kind], extra].filter(Boolean).join(' ');
}

function Lead({ icon, dot }: Pick<ChipOptions, 'icon' | 'dot'>) {
  if (dot)
    return (
      <span
        className={`${styles.dot} ${styles[`dot-${dot}`]}`}
        aria-hidden="true"
      />
    );
  return icon ? <Icon name={icon} size={14} /> : null;
}

/** A static label: status, audience, role. Text always carries the meaning. */
export function Chip({
  kind = 'default',
  icon,
  dot,
  children,
}: ChipOptions & { children: ReactNode }) {
  return (
    <span className={classes(kind)}>
      <Lead {...(icon ? { icon } : {})} {...(dot ? { dot } : {})} />
      {children}
    </span>
  );
}

/** A filter or toggle chip. `selected` is announced with `aria-pressed`. */
export function SelectableChip({
  selected,
  icon,
  dot,
  className,
  type = 'button',
  children,
  ...props
}: Omit<ChipOptions, 'kind'> &
  ButtonHTMLAttributes<HTMLButtonElement> & { selected: boolean }) {
  return (
    <button
      type={type}
      aria-pressed={selected}
      className={classes(
        selected ? 'selected' : 'default',
        `${styles.button} ${className ?? ''}`,
      )}
      {...props}
    >
      <Lead {...(icon ? { icon } : {})} {...(dot ? { dot } : {})} />
      {children}
    </button>
  );
}
