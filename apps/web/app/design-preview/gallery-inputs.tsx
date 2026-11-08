import {
  Button,
  Checkbox,
  Chip,
  IconButton,
  Icon,
  Radio,
  SegmentedControl,
  SelectableChip,
  TextField,
  Toggle,
  type ButtonVariant,
} from '@/components/ui';
import { Block } from '@/design-preview/gallery-block';
import styles from '@/design-preview/gallery.module.css';
const variants: readonly ButtonVariant[] = [
  'primary',
  'secondary',
  'accent',
  'ghost',
  'danger',
];

export function ButtonBlocks() {
  return (
    <>
      <Block title="Button" node="43:98">
        {(['l', 'm', 's'] as const).map((size) => (
          <div key={size} className={styles.row}>
            {variants.map((variant) => (
              <Button key={variant} variant={variant} size={size}>
                {variant}
              </Button>
            ))}
            <Button size={size} disabled>
              Disabled
            </Button>
            <Button size={size} loading>
              Loading
            </Button>
          </div>
        ))}
      </Block>
      <Block title="Icon button" node="43:125">
        <div className={styles.row}>
          {(['surface', 'primary', 'plain'] as const).flatMap((kind) =>
            ([40, 52] as const).map((size) => (
              <IconButton
                key={`${kind}-${size}`}
                label={`Like (${kind} ${size})`}
                kind={kind}
                size={size}
              >
                <Icon name="heart" size={20} />
              </IconButton>
            )),
          )}
        </div>
      </Block>
      <Block title="Chip" node="43:146">
        <div className={styles.row}>
          <Chip>Default</Chip>
          <Chip kind="selected">Selected</Chip>
          <Chip kind="accent" icon="heart">
            Accent
          </Chip>
          <Chip kind="soft">Soft</Chip>
          <Chip kind="brass" icon="spark">
            Brass
          </Chip>
          <Chip dot="ember">Sunday Supper</Chip>
          <SelectableChip selected={false}>Filter</SelectableChip>
          <SelectableChip selected>Filter on</SelectableChip>
        </div>
      </Block>
    </>
  );
}

export function FieldBlocks({ scope }: { scope: string }) {
  return (
    <>
      <Block title="Text field" node="43:189">
        <div className={styles.stack}>
          <TextField
            label="Display name"
            id={`${scope}-name`}
            placeholder="Alice Moreau"
          />
          <TextField
            label="Username"
            id={`${scope}-username`}
            help="Letters, numbers and dots."
            prefix="@"
            defaultValue="alice.moreau"
          />
          <TextField
            label="Email"
            id={`${scope}-email`}
            type="email"
            defaultValue="not-an-email"
            error="Enter an email address like name@example.com."
          />
          <TextField
            label="Read only"
            id={`${scope}-ro`}
            readOnly
            defaultValue="alice@example.com"
          />
        </div>
      </Block>
      <Block title="Toggle, Radio, Checkbox" node="43:198, 43:205, 43:214">
        <div className={styles.stack}>
          <Toggle
            label="Notify me about reactions"
            name={`${scope}-t1`}
            defaultChecked
          />
          <Toggle label="Weekly digest" name={`${scope}-t2`} />
          <Toggle label="Locked option" name={`${scope}-t3`} disabled />
          <Radio
            label="Friends only"
            name={`${scope}-r`}
            value="friends"
            defaultChecked
          />
          <Radio label="Box members" name={`${scope}-r`} value="members" />
          <Checkbox
            label="I understand this cannot be undone"
            name={`${scope}-c1`}
            defaultChecked
          />
          <Checkbox label="Remind me later" name={`${scope}-c2`} />
        </div>
      </Block>
      <Block title="Segmented control" node="43:377">
        <div className={styles.stack}>
          <SegmentedControl
            name={`${scope}-seg2`}
            label="Layout"
            defaultValue="one"
            options={[
              { value: 'one', label: 'One column' },
              { value: 'two', label: 'Two columns' },
            ]}
          />
          <SegmentedControl
            name={`${scope}-seg4`}
            label="Appearance"
            defaultValue="system"
            options={[
              { value: 'system', label: 'System' },
              { value: 'light', label: 'Light' },
              { value: 'dark', label: 'Dark' },
            ]}
          />
        </div>
      </Block>
    </>
  );
}
