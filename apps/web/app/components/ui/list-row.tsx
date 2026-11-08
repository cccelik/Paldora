import { Icon, type IconName } from '@/components/ui/icons';
import styles from '@/components/ui/list-row.module.css';
import { RadioInput, ToggleInput } from '@/components/ui/selection-controls';
import { type Route } from 'next';
import Link from 'next/link';
import { type InputHTMLAttributes, type ReactNode } from 'react';
/** Figma "List row" (43:347), grouped inside a surface card of radius 22. */
export function ListGroup({
  children,
  label,
}: {
  children: ReactNode;
  label?: string;
}) {
  return (
    <ul className={styles.group} aria-label={label}>
      {children}
    </ul>
  );
}

type RowControl = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  'type' | 'children'
>;

interface ListRowProps {
  title: string;
  subtitle?: string;
  icon?: IconName;
  /** Destructive rows use the danger colour and an ember-soft icon tile. */
  destructive?: boolean;
  /** A trailing value, shown before the chevron. */
  value?: string;
  /**
   * `link` and `button` rows show a chevron; `toggle` and `radio` rows are
   * one label around a native input; `static` has no trailing element.
   */
  kind?: 'link' | 'button' | 'toggle' | 'radio' | 'static';
  href?: string;
  onClick?: () => void;
  control?: RowControl;
}

function Lead({ title, subtitle, icon, value }: ListRowProps) {
  return (
    <>
      {icon ? (
        <span className={styles.icon}>
          <Icon name={icon} size={18} />
        </span>
      ) : null}
      <span className={styles.text}>
        <span className={styles.title}>{title}</span>
        {subtitle ? <span className={styles.subtitle}>{subtitle}</span> : null}
      </span>
      {value ? <span className={styles.value}>{value}</span> : null}
    </>
  );
}

export function ListRow(props: ListRowProps) {
  const {
    kind = 'static',
    href,
    onClick,
    control,
    destructive,
    subtitle,
  } = props;
  const className = [
    styles.row,
    destructive ? styles.destructive : '',
    subtitle ? styles.tall : '',
  ]
    .filter(Boolean)
    .join(' ');
  const chevron = (
    <span className={styles.chevron}>
      <Icon name="chev" size={16} />
    </span>
  );
  let row: ReactNode;
  if (kind === 'toggle' || kind === 'radio') {
    row = (
      <label className={className}>
        <Lead {...props} />
        {kind === 'toggle' ? (
          <ToggleInput {...control} />
        ) : (
          <RadioInput {...control} />
        )}
      </label>
    );
  } else if (href) {
    row = (
      <Link className={className} href={href as Route}>
        <Lead {...props} />
        {chevron}
      </Link>
    );
  } else if (kind === 'button' || kind === 'link') {
    row = (
      <button
        type="button"
        className={className}
        {...(onClick ? { onClick } : {})}
      >
        <Lead {...props} />
        {chevron}
      </button>
    );
  } else {
    row = (
      <div className={className}>
        <Lead {...props} />
      </div>
    );
  }
  return <li className={styles.item}>{row}</li>;
}
