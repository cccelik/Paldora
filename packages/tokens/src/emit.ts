import type { ResolvedToken } from './resolve.js';
import { accentFor, readRoomThemeTokens, roomSchemeOf } from './room-themes.js';

const header =
  'Generated from design/tokens/paldora.tokens.json by `pnpm tokens:generate`. Do not edit.';

const kebab = (value: string) =>
  value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/\./g, '-')
    .toLowerCase();

/**
 * Self-hosted web fonts are loaded by `next/font/local`, which gives each face
 * a hashed family name and exposes it through a CSS variable. A stack whose
 * first family is listed here starts with that variable and falls back to the
 * plain family name (for example in Storybook-less contexts or tests).
 */
const WEB_FONT_FACE_VARIABLES: Readonly<Record<string, string>> = {
  Fraunces: '--font-fraunces',
  Geist: '--font-geist',
  'Geist Mono': '--font-geist-mono',
};

const quoteFamily = (family: string | number) =>
  /\s/.test(String(family)) ? `'${family}'` : String(family);

function cssFontStack(families: readonly (string | number)[]): string {
  const [first, ...rest] = families;
  const variable =
    first === undefined ? undefined : WEB_FONT_FACE_VARIABLES[String(first)];
  const stack = families.map(quoteFamily);
  if (variable === undefined || first === undefined) return stack.join(', ');
  return [
    `var(${variable}, ${quoteFamily(first)})`,
    ...rest.map(quoteFamily),
  ].join(', ');
}

function cssValue(token: ResolvedToken): string {
  if (token.type === 'cubicBezier' && Array.isArray(token.value)) {
    return `cubic-bezier(${token.value.join(', ')})`;
  }
  if (token.type === 'fontFamily' && Array.isArray(token.value)) {
    return cssFontStack(token.value);
  }
  return String(token.value);
}

/** `#RRGGBBAA` to `rgba(r, g, b, a)` with the alpha rounded to 2 places. */
function cssRgba(value: string): string {
  const match =
    /^#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})?$/i.exec(value);
  if (!match?.[1] || !match[2] || !match[3]) {
    throw new Error(`Unsupported color value ${value}.`);
  }
  const alpha = match[4] ? parseInt(match[4], 16) / 255 : 1;
  const channel = (hex: string) => parseInt(hex, 16);
  return `rgba(${channel(match[1])}, ${channel(match[2])}, ${channel(match[3])}, ${Number(alpha.toFixed(2))})`;
}

/** Composes `--pal-elevation-<name>` box-shadow values from the parts. */
function elevationBlock(tokens: readonly ResolvedToken[]): string {
  const byPath = new Map(tokens.map((token) => [token.path, token.value]));
  const names = [
    ...new Set(
      tokens
        .filter((token) => token.path.startsWith('elevation.'))
        .map((token) => token.path.split('.')[1] ?? ''),
    ),
  ];
  return names
    .map((name) => {
      const part = (key: string) =>
        String(byPath.get(`elevation.${name}.${key}`));
      return `  --pal-elevation-${kebab(name)}: ${part('x')} ${part('y')} ${part('blur')} ${part('spread')} ${cssRgba(part('color'))};`;
    })
    .join('\n');
}

/**
 * Semantic colors for one mode. `deprecated.<mode>.*` keeps the pre-v2 names
 * (--pal-canvas, --pal-text, ...) alive for the web CSS that has not
 * migrated yet; they hold the same value as their v2 replacement.
 */
function themeBlock(tokens: readonly ResolvedToken[], mode: string): string {
  const prefixes = [`theme.${mode}.`, `deprecated.${mode}.`];
  return tokens
    .flatMap((token) => {
      const prefix = prefixes.find((candidate) =>
        token.path.startsWith(candidate),
      );
      return prefix === undefined
        ? []
        : [
            `  --pal-${kebab(token.path.slice(prefix.length))}: ${cssValue(token)};`,
          ];
    })
    .join('\n');
}

/**
 * Primitives become `--pal-<path>` custom properties. Semantic theme tokens
 * become `--pal-<name>` and switch with `data-appearance` or, when the user
 * chose "system", with `prefers-color-scheme`.
 */
export function emitCss(tokens: readonly ResolvedToken[]): string {
  const primitives = tokens
    // Room tokens never reach the shell; they live in room-themes.css.
    .filter(
      (token) =>
        !token.path.startsWith('theme.') &&
        !token.path.startsWith('deprecated.') &&
        !token.path.startsWith('room.') &&
        !token.path.startsWith('elevation.'),
    )
    .map((token) => `  --pal-${kebab(token.path)}: ${cssValue(token)};`)
    .concat(elevationBlock(tokens))
    .join('\n');
  const light = themeBlock(tokens, 'light');
  const dark = themeBlock(tokens, 'dark');
  return `/* ${header} */
:root {
${primitives}
}

:root,
[data-appearance='light'] {
  color-scheme: light;
${light}
}

@media (prefers-color-scheme: dark) {
  :root:not([data-appearance='light']) {
    color-scheme: dark;
${dark.replace(/^ {2}/gm, '    ')}
  }
}

[data-appearance='dark'] {
  color-scheme: dark;
${dark}
}
`;
}

const fontStack = (families: readonly string[]) =>
  families
    .map((family) => (/\s/.test(family) ? `'${family}'` : family))
    .join(', ');

/**
 * Room themes as static CSS selected by `data-*` attributes on
 * `.room-canvas` (ADR 017). No color is ever computed from user input, and
 * nothing here needs an inline style, so the strict CSP holds. The preset
 * sets the surface colors, the scheme picks each accent's side, and the
 * font key picks a system stack.
 */
export function emitRoomCss(tokens: readonly ResolvedToken[]): string {
  const { presets, accents, fonts } = readRoomThemeTokens(tokens);
  const presetRules = presets.map(
    ({ id, colors }) => `.room-canvas[data-room-theme='${id}'] {
  --room-canvas: ${colors.canvas};
  --room-surface: ${colors.surface};
  --room-text: ${colors.text};
  --room-text-muted: ${colors.textMuted};
  --room-border: ${colors.border};
}`,
  );
  const schemeRules = (['light', 'dark'] as const).map(
    (scheme) => `.room-canvas[data-room-scheme='${scheme}'] {
  color-scheme: ${scheme};
}`,
  );
  const accentRules = (['light', 'dark'] as const).flatMap((scheme) =>
    accents.map(
      (accent) =>
        `.room-canvas[data-room-scheme='${scheme}'][data-room-accent='${accent.key}'] {
  --room-accent: ${accentFor(accent, scheme)};
}`,
    ),
  );
  const fontRules = fonts.map(
    ({ key, families }) => `.room-canvas[data-room-font='${key}'] {
  --room-font: ${fontStack(families)};
}`,
  );
  return `/* ${header} */
${[...presetRules, ...schemeRules, ...accentRules, ...fontRules].join('\n\n')}
`;
}

export function emitTypeScript(tokens: readonly ResolvedToken[]): string {
  const entries = tokens
    .map(
      (token) =>
        `  ${JSON.stringify(token.path)}: ${JSON.stringify(token.value)},`,
    )
    .join('\n');
  return `// ${header}
export const tokens = {
${entries}
} as const;

export type TokenPath = keyof typeof tokens;
`;
}

const identifier = (path: string) =>
  path
    .split('.')
    .map((part, index) =>
      index === 0 ? part : part.charAt(0).toUpperCase() + part.slice(1),
    )
    .join('')
    .replace(/^(\d)/, '_$1');

type NativeLanguage = 'swift' | 'kotlin';

interface NativeValue {
  readonly type: string;
  readonly literal: string;
}

/** `4.0000` -> `4`; keeps float noise (20.800000000000004) out of the files. */
const cleanNumber = (value: number) => String(Number(value.toFixed(4)));

/** `#RRGGBB` or `#RRGGBBAA` to an opaque-first 0xAARRGGBB literal body. */
function argbHex(value: string): string {
  const match = /^#([0-9A-F]{6})([0-9A-F]{2})?$/i.exec(value);
  if (!match?.[1]) throw new Error(`Unsupported color value ${value}.`);
  return `${(match[2] ?? 'FF').toUpperCase()}${match[1].toUpperCase()}`;
}

function colorLiteral(value: string, language: NativeLanguage): string {
  const hex = argbHex(value);
  return language === 'swift' ? `PaldoraColor(argb: 0x${hex})` : `0x${hex}L`;
}

/**
 * Dimensions are plain numbers: px and dp/pt are 1:1, rem is multiplied by
 * the 16-unit root size, and em stays a unitless ratio of the parent size.
 */
function dimensionNumber(value: string): number {
  const match = /^(-?[\d.]+)(px|rem|em)$/.exec(value);
  if (!match?.[1]) throw new Error(`Unsupported dimension ${value}.`);
  const amount = Number(match[1]);
  return match[2] === 'rem' ? amount * 16 : amount;
}

function durationSeconds(value: string): number {
  const match = /^([\d.]+)ms$/.exec(value);
  if (!match?.[1]) throw new Error(`Unsupported duration ${value}.`);
  return Number(match[1]);
}

const isInteger = (value: number) => Number.isInteger(value);

function numberValue(value: number, language: NativeLanguage): NativeValue {
  if (isInteger(value)) return { type: 'Int', literal: String(value) };
  const literal = cleanNumber(value);
  return language === 'swift'
    ? { type: 'CGFloat', literal }
    : { type: 'Float', literal: `${literal}f` };
}

function listValue(
  items: readonly (string | number)[],
  language: NativeLanguage,
): NativeValue {
  const numeric = items.every((item) => typeof item === 'number');
  const literals = items.map((item) =>
    typeof item === 'number'
      ? language === 'swift'
        ? cleanNumber(item)
        : `${cleanNumber(item)}f`
      : JSON.stringify(item),
  );
  if (language === 'swift') {
    return {
      type: numeric ? '[Double]' : '[String]',
      literal: `[${literals.join(', ')}]`,
    };
  }
  return {
    type: numeric ? 'List<Float>' : 'List<String>',
    literal: `listOf(${literals.join(', ')})`,
  };
}

/**
 * Maps a resolved token to a native type and literal:
 * colors -> `PaldoraColor` / ARGB `Long`; dimensions -> `CGFloat` / `Float`
 * (points / dp); durations -> seconds `Double` / milliseconds `Int`.
 */
function nativeValue(
  token: ResolvedToken,
  language: NativeLanguage,
): NativeValue {
  const { type, value } = token;
  if (Array.isArray(value)) return listValue(value, language);
  if (type === 'color' && typeof value === 'string') {
    return {
      type: language === 'swift' ? 'PaldoraColor' : 'Long',
      literal: colorLiteral(value, language),
    };
  }
  if (type === 'dimension' && typeof value === 'string') {
    const amount = dimensionNumber(value);
    return language === 'swift'
      ? { type: 'CGFloat', literal: cleanNumber(amount) }
      : { type: 'Float', literal: `${cleanNumber(amount)}f` };
  }
  if (type === 'duration' && typeof value === 'string') {
    const milliseconds = durationSeconds(value);
    return language === 'swift'
      ? { type: 'TimeInterval', literal: cleanNumber(milliseconds / 1000) }
      : { type: 'Int', literal: String(milliseconds) };
  }
  if (typeof value === 'number') return numberValue(value, language);
  return { type: 'String', literal: JSON.stringify(value) };
}

/** Room tokens ship as the structured tables below, not as flat constants. */
const nativeFlatTokens = (tokens: readonly ResolvedToken[]) =>
  tokens.filter(
    (token) =>
      !token.path.startsWith('room.') && !token.path.startsWith('deprecated.'),
  );

interface SemanticColor {
  readonly name: string;
  readonly light: string;
  readonly dark: string;
}

/** Light/Dark pairs of `theme.<mode>.<name>`, in source order. */
function semanticColors(tokens: readonly ResolvedToken[]): SemanticColor[] {
  const dark = new Map(
    tokens
      .filter((token) => token.path.startsWith('theme.dark.'))
      .map((token) => [token.path.slice('theme.dark.'.length), token.value]),
  );
  return tokens
    .filter((token) => token.path.startsWith('theme.light.'))
    .map((token) => {
      const name = token.path.slice('theme.light.'.length);
      const darkValue = dark.get(name);
      if (typeof darkValue !== 'string' || typeof token.value !== 'string') {
        throw new Error(
          `Theme token ${name} is missing a Light or Dark value.`,
        );
      }
      return { name, light: token.value, dark: darkValue };
    });
}

const memberName = (path: string) => {
  const id = identifier(path);
  return id.charAt(0).toLowerCase() + id.slice(1);
};

function swiftSemanticColors(tokens: readonly ResolvedToken[]): string {
  const items = semanticColors(tokens).map(
    ({ name, light, dark }) =>
      `    public static let ${memberName(name)} = PaldoraSemanticColor(light: ${colorLiteral(light, 'swift')}, dark: ${colorLiteral(dark, 'swift')})`,
  );
  return `
/// A color with a value per interface style. The app turns it into a dynamic
/// \`Color\` that resolves by \`userInterfaceStyle\`.
public struct PaldoraSemanticColor: Equatable, Sendable {
    public let light: PaldoraColor
    public let dark: PaldoraColor

    public init(light: PaldoraColor, dark: PaldoraColor) {
        self.light = light
        self.dark = dark
    }
}

/// Semantic colors, named like the Figma variables (color/bg/canvas = bgCanvas).
public enum PaldoraColors {
${items.join('\n')}
}
`;
}

function kotlinSemanticColors(tokens: readonly ResolvedToken[]): string {
  const colors = semanticColors(tokens);
  const lines = (side: 'light' | 'dark') =>
    colors
      .map(
        (color) =>
          `    const val ${memberName(color.name)}: Long = ${colorLiteral(color[side], 'kotlin')}`,
      )
      .join('\n');
  return `
/** Semantic colors for the Light appearance (color/bg/canvas = bgCanvas). */
object PaldoraLightColors {
${lines('light')}
}

/** Semantic colors for the Dark appearance; same names as [PaldoraLightColors]. */
object PaldoraDarkColors {
${lines('dark')}
}
`;
}

const swiftDoc = `// Units: dimensions are CGFloat points (rem x 16; em stays a ratio),
// durations are TimeInterval seconds, colors are sRGB PaldoraColor values.`;

const kotlinDoc = `// Units: dimensions are Float dp/sp (rem x 16; em stays a ratio),
// durations are Int milliseconds, colors are Long 0xAARRGGBB sRGB values
// (pass to androidx.compose.ui.graphics.Color(Long) in the app).`;

function swiftRoomTables(tokens: readonly ResolvedToken[]): string {
  const { presets, accents, fonts } = readRoomThemeTokens(tokens);
  const color = (value: string) => colorLiteral(value, 'swift');
  const presetItems = presets.map(
    ({ id, colors }) => `        PaldoraRoomPreset(
            id: ${JSON.stringify(id)},
            scheme: .${roomSchemeOf(colors)},
            canvas: ${color(colors.canvas)},
            surface: ${color(colors.surface)},
            text: ${color(colors.text)},
            textMuted: ${color(colors.textMuted)},
            border: ${color(colors.border)}
        ),`,
  );
  const accentItems = accents.map(
    (accent) =>
      `        PaldoraRoomAccent(key: ${JSON.stringify(accent.key)}, onLight: ${color(accent.onLight)}, onDark: ${color(accent.onDark)}),`,
  );
  const fontItems = fonts.map(
    (font) =>
      `        PaldoraRoomFont(key: ${JSON.stringify(font.key)}, families: ${listValue(font.families, 'swift').literal}),`,
  );
  return `
public enum PaldoraRoomScheme: String, Sendable {
    case light
    case dark
}

public struct PaldoraRoomPreset: Equatable, Sendable {
    public let id: String
    public let scheme: PaldoraRoomScheme
    public let canvas: PaldoraColor
    public let surface: PaldoraColor
    public let text: PaldoraColor
    public let textMuted: PaldoraColor
    public let border: PaldoraColor
}

public struct PaldoraRoomAccent: Equatable, Sendable {
    public let key: String
    public let onLight: PaldoraColor
    public let onDark: PaldoraColor

    public func color(for scheme: PaldoraRoomScheme) -> PaldoraColor {
        scheme == .light ? onLight : onDark
    }
}

public struct PaldoraRoomFont: Equatable, Sendable {
    public let key: String
    public let families: [String]
}

/// Room themes (ADR 017), keyed by the domain ids used by the API.
public enum PaldoraRoomThemes {
    public static let presets: [PaldoraRoomPreset] = [
${presetItems.join('\n')}
    ]

    public static let accents: [PaldoraRoomAccent] = [
${accentItems.join('\n')}
    ]

    public static let fonts: [PaldoraRoomFont] = [
${fontItems.join('\n')}
    ]
}
`;
}

function kotlinRoomTables(tokens: readonly ResolvedToken[]): string {
  const { presets, accents, fonts } = readRoomThemeTokens(tokens);
  const color = (value: string) => colorLiteral(value, 'kotlin');
  const presetItems = presets.map(
    ({ id, colors }) => `        PaldoraRoomPreset(
            id = ${JSON.stringify(id)},
            scheme = PaldoraRoomScheme.${roomSchemeOf(colors).toUpperCase()},
            canvas = ${color(colors.canvas)},
            surface = ${color(colors.surface)},
            text = ${color(colors.text)},
            textMuted = ${color(colors.textMuted)},
            border = ${color(colors.border)},
        ),`,
  );
  const accentItems = accents.map(
    (accent) =>
      `        PaldoraRoomAccent(${JSON.stringify(accent.key)}, ${color(accent.onLight)}, ${color(accent.onDark)}),`,
  );
  const fontItems = fonts.map(
    (font) =>
      `        PaldoraRoomFont(${JSON.stringify(font.key)}, ${listValue(font.families, 'kotlin').literal}),`,
  );
  return `
enum class PaldoraRoomScheme { LIGHT, DARK }

data class PaldoraRoomPreset(
    val id: String,
    val scheme: PaldoraRoomScheme,
    val canvas: Long,
    val surface: Long,
    val text: Long,
    val textMuted: Long,
    val border: Long,
)

data class PaldoraRoomAccent(val key: String, val onLight: Long, val onDark: Long) {
    fun color(scheme: PaldoraRoomScheme): Long =
        if (scheme == PaldoraRoomScheme.LIGHT) onLight else onDark
}

data class PaldoraRoomFont(val key: String, val families: List<String>)

/** Room themes (ADR 017), keyed by the domain ids used by the API. */
object PaldoraRoomThemes {
    val presets: List<PaldoraRoomPreset> = listOf(
${presetItems.join('\n')}
    )

    val accents: List<PaldoraRoomAccent> = listOf(
${accentItems.join('\n')}
    )

    val fonts: List<PaldoraRoomFont> = listOf(
${fontItems.join('\n')}
    )
}
`;
}

/**
 * Typed token values for the native apps: numeric dimensions, ARGB colors,
 * and the Room theme tables. Not compiled by swiftc yet (see the README).
 */
export function emitSwift(tokens: readonly ResolvedToken[]): string {
  const lines = nativeFlatTokens(tokens)
    .map((token) => {
      const { type, literal } = nativeValue(token, 'swift');
      return `    public static let ${identifier(token.path)}: ${type} = ${literal}`;
    })
    .join('\n');
  return `// ${header}
${swiftDoc}
import Foundation

/// sRGB color as 0xAARRGGBB. Convert in the app, for example
/// \`Color(.sRGB, red: c.red, green: c.green, blue: c.blue, opacity: c.alpha)\`.
public struct PaldoraColor: Equatable, Sendable {
    public let argb: UInt32

    public init(argb: UInt32) {
        self.argb = argb
    }

    public var alpha: Double { Double((argb >> 24) & 0xFF) / 255 }
    public var red: Double { Double((argb >> 16) & 0xFF) / 255 }
    public var green: Double { Double((argb >> 8) & 0xFF) / 255 }
    public var blue: Double { Double(argb & 0xFF) / 255 }
}

public enum PaldoraTokens {
${lines}
}
${swiftSemanticColors(tokens)}${swiftRoomTables(tokens)}`;
}

export function emitKotlin(tokens: readonly ResolvedToken[]): string {
  const lines = nativeFlatTokens(tokens)
    .map((token) => {
      const { type, literal } = nativeValue(token, 'kotlin');
      const modifier = type.startsWith('List<') ? 'val' : 'const val';
      return `    ${modifier} ${identifier(token.path)}: ${type} = ${literal}`;
    })
    .join('\n');
  return `// ${header}
${kotlinDoc}
package app.paldora.tokens

object PaldoraTokens {
${lines}
}
${kotlinSemanticColors(tokens)}${kotlinRoomTables(tokens)}`;
}
