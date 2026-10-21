import styles from './photo-attachment-list.module.css';
import { Button } from './ui';
import { type Attachment } from './use-photo-attachments';
const phaseText: Record<Attachment['phase'], string> = {
  uploading: 'Uploading…',
  processing: 'Preparing…',
  ready: 'Ready',
  failed: 'Failed',
};

/**
 * The photos a composer or editor holds, each with its upload status and a
 * Remove button. Shared by the post and Life Update composers.
 */
export function PhotoAttachmentList({
  items,
  onRemove,
  label,
}: {
  items: readonly Attachment[];
  onRemove: (key: number) => void;
  /** The list's accessible name, e.g. "Photos to post". */
  label: string;
}) {
  if (items.length === 0) return null;
  return (
    <ul className={styles.attachments} aria-label={label}>
      {items.map((item, index) => (
        <li key={item.key} className={styles.attachment}>
          <img
            className={styles.attachmentImage}
            src={item.previewUrl}
            alt={`Selected photo ${index + 1}`}
            referrerPolicy="no-referrer"
          />
          <span className={styles.attachmentStatus} role="status">
            {item.message ?? phaseText[item.phase]}
          </span>
          <Button variant="quiet" onClick={() => onRemove(item.key)}>
            Remove photo {index + 1}
          </Button>
        </li>
      ))}
    </ul>
  );
}
