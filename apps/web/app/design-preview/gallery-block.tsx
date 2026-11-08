import styles from '@/design-preview/gallery.module.css';
import { type ReactNode } from 'react';
/** One gallery entry: its name, the Figma node it comes from, and the demo. */
export function Block({
  title,
  node,
  children,
}: {
  title: string;
  node: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.block} data-gallery-block={title}>
      <h3 className={styles.blockTitle}>{title}</h3>
      <p className={styles.node}>Figma {node}</p>
      {children}
    </section>
  );
}
