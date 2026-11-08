import styles from '@/components/ui/segmented-control.module.css';
import { type ChangeEventHandler } from 'react';
/**
 * Figma "Segmented control" (43:377), two to four options. A native radio
 * group, so arrow keys, forms and no-JavaScript submission work as usual.
 */
export function SegmentedControl({
  name,
  label,
  options,
  value,
  defaultValue,
  onChange,
}: {
  name: string;
  /** The group's accessible name. */
  label: string;
  options: readonly { value: string; label: string }[];
  value?: string;
  defaultValue?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
}) {
  return (
    <fieldset className={styles.control} data-count={options.length}>
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className={styles.segment}>
          <input
            className={styles.input}
            type="radio"
            name={name}
            value={option.value}
            {...(value !== undefined
              ? { checked: value === option.value }
              : { defaultChecked: defaultValue === option.value })}
            {...(onChange ? { onChange } : {})}
          />
          <span className={styles.face}>{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
