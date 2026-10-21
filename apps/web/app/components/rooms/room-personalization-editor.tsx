'use client';
import { savePersonalization } from '@/actions/personalization';
import {
  EditorSection,
  RoomSaveButton,
  RoomSectionFeedback,
  RoomVersionField,
} from '@/components/rooms/room-editor-parts';
import {
  useRoomSave,
  type RoomSaveContext,
} from '@/components/rooms/use-room-save';
import { Button, TextAreaField, TextField } from '@/components/ui';
import type { PersonalizationSource } from '@paldora/validation';
import { useState } from 'react';
import styles from './room-personalization.module.css';

export function RoomPersonalizationEditor({
  source,
  context,
}: {
  source: PersonalizationSource;
  context: RoomSaveContext;
}) {
  const [css, setCss] = useState(source.cssSource);
  const [widgets, setWidgets] = useState(source.widgets);
  const [state, action] = useRoomSave(savePersonalization, context);
  if (!source.cssEnabled && !source.widgetsEnabled) return null;
  const patch = (
    index: number,
    change: Partial<PersonalizationSource['widgets'][number]>,
  ) =>
    setWidgets((current) =>
      current.map((widget, position) =>
        position === index ? { ...widget, ...change } : widget,
      ),
    );
  const move = (index: number, offset: number) =>
    setWidgets((current) => reorder(current, index, offset));
  return (
    <EditorSection
      id="customize-personalization"
      title="Personalization"
      description="Typography and static text widgets. These never change who can see your Room."
    >
      <form action={action} className={styles.form}>
        <RoomVersionField context={context} />
        {source.cssEnabled ? (
          <>
            <CssFields css={css} setCss={setCss} />
          </>
        ) : (
          <input type="hidden" name="cssSource" value={css} />
        )}
        {source.widgetsEnabled ? (
          <>
            <p>
              Up to three text widgets, 8 KiB each. Use p, h2, h3, span, strong,
              em, ul, ol, li, br, blockquote, pre and code. Attributes, links,
              images and scripts are unavailable.
            </p>
            {widgets.map((widget, index) => (
              <fieldset key={index} className={styles.widget}>
                <legend>Text widget {index + 1}</legend>
                <TextField
                  label="Widget title"
                  id={`widget-title-${index}`}
                  name={`title-${index}`}
                  maxLength={80}
                  value={widget.title}
                  onChange={(event) =>
                    patch(index, { title: event.target.value })
                  }
                />
                <TextAreaField
                  label="Widget HTML"
                  id={`widget-source-${index}`}
                  name={`source-${index}`}
                  rows={5}
                  maxLength={8192}
                  value={widget.source}
                  onChange={(event) =>
                    patch(index, { source: event.target.value })
                  }
                />
                <div className={styles.actions}>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={index === 0}
                    onClick={() => move(index, -1)}
                    aria-label={`Move widget ${index + 1} up`}
                  >
                    Move up
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    disabled={index === widgets.length - 1}
                    onClick={() => move(index, 1)}
                    aria-label={`Move widget ${index + 1} down`}
                  >
                    Move down
                  </Button>
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() =>
                      setWidgets((current) =>
                        current.filter((_, position) => position !== index),
                      )
                    }
                    aria-label={`Remove widget ${index + 1}`}
                  >
                    Remove
                  </Button>
                </div>
              </fieldset>
            ))}
            <Button
              variant="secondary"
              type="button"
              disabled={widgets.length >= 3}
              onClick={() =>
                setWidgets((current) => [
                  ...current,
                  { title: '', source: '<p>Hello friends</p>' },
                ])
              }
            >
              Add text widget
            </Button>
          </>
        ) : (
          widgets.map((widget, index) => (
            <span key={index}>
              <input
                type="hidden"
                name={`title-${index}`}
                value={widget.title}
              />
              <input
                type="hidden"
                name={`source-${index}`}
                value={widget.source}
              />
            </span>
          ))
        )}
        <RoomSectionFeedback
          state={state}
          context={context}
          lockedId="personalization-locked"
        />
        <RoomSaveButton context={context} lockedId="personalization-locked">
          Save personalization
        </RoomSaveButton>
      </form>
    </EditorSection>
  );
}

function CssFields({
  css,
  setCss,
}: {
  css: string;
  setCss: (value: string) => void;
}) {
  return (
    <>
      <p>
        Use .room-title, .room-card or .room-text. Supported properties:
        font-weight (400, 500, 600, 700), font-style (normal, italic),
        text-align (left, center, right), line-height (1.4, 1.5, 1.6, 1.8),
        letter-spacing (0, 0.02em, 0.05em, 0.1em). Maximum 8 KiB, 64 rules and
        256 declarations. Leave empty to remove.
      </p>
      <TextAreaField
        label="Room CSS"
        id="room-css"
        name="cssSource"
        rows={6}
        maxLength={8192}
        value={css}
        onChange={(event) => setCss(event.target.value)}
        help="Example: .room-title { font-weight: 700; }"
      />
    </>
  );
}

function reorder(
  current: PersonalizationSource['widgets'],
  index: number,
  offset: number,
) {
  const next = [...current];
  const item = next[index];
  if (!item) return current;
  next.splice(index, 1);
  next.splice(index + offset, 0, item);
  return next;
}
