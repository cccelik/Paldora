import { ComponentGallery } from '@/design-preview/component-gallery';
import styles from '@/design-preview/gallery.module.css';
import { designPreviewEnabled } from '@/lib/server/design-preview';
import { type Metadata } from 'next';
import { notFound } from 'next/navigation';
export const metadata: Metadata = { title: 'Component gallery' };

/**
 * Every Figma component (page "02 Components") in Light and Dark. Local only:
 * any other environment answers 404, like the other fixture routes.
 */
export default function DesignPreviewPage() {
  if (!designPreviewEnabled()) notFound();
  return (
    <main id="main" className={styles.page}>
      <h1 className={styles.pageTitle}>Component gallery</h1>
      <p className={styles.note}>
        Hearth &amp; Brass components from the Figma kit, drawn on the generated
        tokens. Development only.
      </p>
      <section
        aria-labelledby="gallery-light"
        className={styles.panel}
        data-appearance="light"
      >
        <h2 id="gallery-light" className={styles.panelTitle}>
          Light
        </h2>
        <ComponentGallery scope="light" />
      </section>
      <section
        aria-labelledby="gallery-dark"
        className={styles.panel}
        data-appearance="dark"
      >
        <h2 id="gallery-dark" className={styles.panelTitle}>
          Dark
        </h2>
        <ComponentGallery scope="dark" />
      </section>
    </main>
  );
}
