'use client';

import {
  ROOM_ACCENT_LABELS,
  ROOM_ACCENTS,
  ROOM_DECORATION_LABELS,
  ROOM_DECORATION_PACKS,
  ROOM_DEFAULT_FONT,
  ROOM_FONT_LABELS,
  ROOM_FONTS,
  ROOM_LAYOUT_LABELS,
  ROOM_LAYOUTS,
  ROOM_THEME_META,
  ROOM_THEME_PRESETS,
  type RoomLayout,
  type RoomThemePreset,
} from '@paldora/domain';
import type { RoomView } from '@paldora/validation';
import { updateRoomAction } from '../actions/rooms';
import { roomThemeAttributes } from '../lib/room-theme';
import {
  EditorSection,
  RoomSaveButton,
  RoomSectionFeedback,
  RoomVersionField,
} from './room-editor-parts';
import { useRoomSave, type RoomSaveContext } from './use-room-save';
import styles from './room-editor.module.css';

type RoomStyle = RoomView['style'];

const layoutDetail: Readonly<Record<RoomLayout, string>> = {
  single: 'Every widget in one column, in your order.',
  two_column: 'A sidebar and a main column. Phones show one column.',
};

/** A small, decorative sample of a theme: its own canvas, text, accent. */
function ThemeSwatch({ style }: { style: RoomStyle }) {
  return (
    <span
      className={`room-canvas ${styles.swatch}`}
      aria-hidden="true"
      {...roomThemeAttributes(style)}
    >
      <span className={styles.swatchText}>Aa</span>
      <span className={styles.swatchSurface} />
      <span className={styles.swatchAccent} />
    </span>
  );
}

function ThemePicker({
  draft,
  onChange,
}: {
  draft: RoomStyle;
  onChange: (preset: RoomThemePreset) => void;
}) {
  return (
    <fieldset className={styles.fieldset}>
      <legend className={styles.legend}>Theme</legend>
      <div className={styles.themes}>
        {ROOM_THEME_PRESETS.map((preset) => {
          const meta = ROOM_THEME_META[preset];
          return (
            <label key={preset} className={styles.theme}>
              <input
                type="radio"
                name="themePreset"
                value={preset}
                checked={draft.themePreset === preset}
                onChange={() => onChange(preset)}
              />
              <ThemeSwatch style={{ ...draft, themePreset: preset }} />
              <span className={styles.themeName}>{meta.label}</span>
              <span className={styles.themeScheme}>
                {meta.scheme === 'dark' ? 'Dark' : 'Light'}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

/** A select whose empty choice follows the theme, naming what that is. */
function FollowSelect<Value extends string>({
  id,
  label,
  name,
  value,
  follows,
  options,
  onChange,
}: {
  id: string;
  label: string;
  name: string;
  value: Value | null;
  follows: string;
  options: readonly { value: Value; label: string }[];
  onChange: (value: Value | null) => void;
}) {
  return (
    <div className={styles.control}>
      <label className={styles.label} htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        name={name}
        className={styles.select}
        value={value ?? ''}
        onChange={(event) => {
          const next = options.find(
            (option) => option.value === event.target.value,
          );
          onChange(next ? next.value : null);
        }}
      >
        <option value="">Follow the theme ({follows})</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const accentOptions = ROOM_ACCENTS.map((value) => ({
  value,
  label: ROOM_ACCENT_LABELS[value],
}));
const fontOptions = ROOM_FONTS.map((value) => ({
  value,
  label: ROOM_FONT_LABELS[value],
}));
const decorationOptions = ROOM_DECORATION_PACKS.map((value) => ({
  value,
  label: ROOM_DECORATION_LABELS[value],
}));

/**
 * Theme, accent, font, decoration, sparkles, and layout. Every change
 * shows in the live preview at once; nothing is saved until "Save".
 */
export function RoomAppearanceForm({
  draft,
  onDraft,
  context,
}: {
  draft: RoomStyle;
  onDraft: (style: RoomStyle) => void;
  context: RoomSaveContext;
}) {
  const [state, action] = useRoomSave(updateRoomAction, context, (room) =>
    onDraft(room.style),
  );
  const meta = ROOM_THEME_META[draft.themePreset];
  const change = (patch: Partial<RoomStyle>) => onDraft({ ...draft, ...patch });
  const lockedId = 'customize-appearance-locked';
  return (
    <EditorSection
      id="customize-appearance"
      title="Appearance"
      description="Your Room’s look. It never changes the app around it: Light, Dark, or System is in Settings."
    >
      <form action={action} className={styles.form}>
        <input type="hidden" name="section" value="appearance" />
        <RoomVersionField context={context} />
        <ThemePicker
          draft={draft}
          onChange={(themePreset) => change({ themePreset })}
        />
        <div className={styles.selects}>
          <FollowSelect
            id="customize-accent"
            label="Accent"
            name="accent"
            value={draft.accent}
            follows={ROOM_ACCENT_LABELS[meta.defaultAccent]}
            options={accentOptions}
            onChange={(accent) => change({ accent })}
          />
          <FollowSelect
            id="customize-font"
            label="Heading font"
            name="font"
            value={draft.font}
            follows={ROOM_FONT_LABELS[ROOM_DEFAULT_FONT]}
            options={fontOptions}
            onChange={(font) => change({ font })}
          />
          <FollowSelect
            id="customize-decoration"
            label="Decoration"
            name="decorationPack"
            value={draft.decorationPack}
            follows={ROOM_DECORATION_LABELS[meta.defaultDecoration]}
            options={decorationOptions}
            onChange={(decorationPack) => change({ decorationPack })}
          />
        </div>
        <label className={styles.check}>
          <input
            type="checkbox"
            name="sparkles"
            checked={draft.sparkles}
            onChange={(event) => change({ sparkles: event.target.checked })}
          />
          <span>
            <span className={styles.optionLabel}>Sparkles</span>
            <span className={styles.optionDetail}>
              A few glints in your banner. They hold still for anyone whose
              device asks for reduced motion.
            </span>
          </span>
        </label>
        <fieldset className={styles.fieldset}>
          <legend className={styles.legend}>Layout</legend>
          {ROOM_LAYOUTS.map((layout) => (
            <label key={layout} className={styles.option}>
              <input
                type="radio"
                name="layout"
                value={layout}
                checked={draft.layout === layout}
                onChange={() => change({ layout })}
              />
              <span>
                <span className={styles.optionLabel}>
                  {ROOM_LAYOUT_LABELS[layout]}
                </span>
                <span className={styles.optionDetail}>
                  {layoutDetail[layout]}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <RoomSectionFeedback
          state={state}
          context={context}
          lockedId={lockedId}
        />
        <div className={styles.actions}>
          <RoomSaveButton context={context} lockedId={lockedId}>
            Save appearance
          </RoomSaveButton>
        </div>
      </form>
    </EditorSection>
  );
}
