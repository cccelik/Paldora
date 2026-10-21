'use client';

import {
  LIFE_UPDATE_MEDIA_MAX_ITEMS,
  LIFE_UPDATE_SECTION_KEYS,
  LIFE_UPDATE_SECTION_LABELS,
  LIFE_UPDATE_SECTION_MAX_LENGTH,
  LIFE_UPDATE_TOTAL_MAX_LENGTH,
  type LifeUpdateSectionKey,
} from '@paldora/domain';
import { useRef } from 'react';
import { PHOTO_ACCEPT } from '../lib/image-upload';
import {
  sectionFieldName,
  sectionsTotal,
  type SectionDrafts,
} from '../lib/life-update-form';
import styles from './life-update-form.module.css';
import { PhotoAttachmentList } from './photo-attachment-list';
import { Button, HiddenFields, TextAreaField } from './ui';
import { type usePhotoAttachments } from './use-photo-attachments';
const count = (value: number) => value.toLocaleString('en');

/**
 * The nine optional sections, each with its own counter, and the running
 * total. Every field is sent, so clearing one removes that section.
 */
export function LifeUpdateSectionFields({
  idPrefix,
  drafts,
  onChange,
}: {
  idPrefix: string;
  drafts: SectionDrafts;
  onChange: (key: LifeUpdateSectionKey, value: string) => void;
}) {
  const total = sectionsTotal(drafts);
  const over = total > LIFE_UPDATE_TOTAL_MAX_LENGTH;
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>What’s new</legend>
      <p className={styles.hint}>
        Fill in any sections you like and leave the rest empty.
      </p>
      <div className={styles.sections}>
        {LIFE_UPDATE_SECTION_KEYS.map((key) => {
          const value = drafts[key] ?? '';
          return (
            <TextAreaField
              key={key}
              label={LIFE_UPDATE_SECTION_LABELS[key]}
              id={`${idPrefix}-${key}`}
              name={sectionFieldName(key)}
              rows={2}
              value={value}
              maxLength={LIFE_UPDATE_SECTION_MAX_LENGTH}
              onChange={(event) => onChange(key, event.target.value)}
              help={`${count(value.length)} / ${count(LIFE_UPDATE_SECTION_MAX_LENGTH)}`}
            />
          );
        })}
      </div>
      <p className={over ? styles.totalOver : styles.total}>
        Total {count(total)} / {count(LIFE_UPDATE_TOTAL_MAX_LENGTH)}
      </p>
    </fieldset>
  );
}

/** Up to four photos, through the shared attachment flow. */
export function LifeUpdatePhotoField({
  photos,
}: {
  photos: ReturnType<typeof usePhotoAttachments>;
}) {
  const picker = useRef<HTMLInputElement>(null);
  return (
    <div className={styles.photos}>
      <HiddenFields
        values={{ mediaAssetIds: JSON.stringify(photos.readyIds) }}
      />
      <PhotoAttachmentList
        items={photos.items}
        onRemove={photos.remove}
        label="Photos to share"
      />
      <input
        ref={picker}
        className="visually-hidden"
        type="file"
        multiple
        accept={PHOTO_ACCEPT}
        aria-label="Choose photos"
        tabIndex={-1}
        onChange={(event) => {
          photos.add([...(event.target.files ?? [])]);
          event.target.value = '';
        }}
      />
      <div>
        <Button
          variant="secondary"
          disabled={photos.full}
          onClick={() => picker.current?.click()}
        >
          {photos.items.length === 0
            ? 'Add photos'
            : `Add more (${photos.items.length}/${LIFE_UPDATE_MEDIA_MAX_ITEMS})`}
        </Button>
      </div>
    </div>
  );
}
