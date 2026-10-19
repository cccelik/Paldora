export type TokenValue = string | number | readonly (string | number)[];

export interface ResolvedToken {
  readonly path: string;
  readonly type: string;
  readonly value: TokenValue;
}

type TokenTree = { [key: string]: unknown };

const aliasPattern = /^\{([^}]+)\}$/;

function isToken(
  node: unknown,
): node is { $value: TokenValue; $type?: string } {
  return typeof node === 'object' && node !== null && '$value' in node;
}

function collect(
  node: TokenTree,
  prefix: string,
  inheritedType: string | undefined,
  output: Map<string, { type: string; value: TokenValue }>,
): void {
  const groupType = typeof node.$type === 'string' ? node.$type : inheritedType;
  for (const [key, child] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isToken(child)) {
      const type = child.$type ?? groupType;
      if (!type) throw new Error(`Token ${path} has no $type.`);
      output.set(path, { type, value: child.$value });
    } else if (typeof child === 'object' && child !== null) {
      collect(child as TokenTree, path, groupType, output);
    }
  }
}

/**
 * Flattens a W3C DTCG token tree into dot paths, applying inherited `$type`
 * and resolving `{alias}` references. Cycles and dangling aliases throw.
 */
export function resolveTokens(tree: TokenTree): ResolvedToken[] {
  const raw = new Map<string, { type: string; value: TokenValue }>();
  collect(tree, '', undefined, raw);
  const resolve = (path: string, seen: ReadonlySet<string>): TokenValue => {
    const token = raw.get(path);
    if (!token) throw new Error(`Unknown token alias {${path}}.`);
    const alias =
      typeof token.value === 'string' ? aliasPattern.exec(token.value) : null;
    if (!alias?.[1]) return token.value;
    if (seen.has(alias[1])) throw new Error(`Token alias cycle at ${path}.`);
    return resolve(alias[1], new Set([...seen, path]));
  };
  return [...raw.entries()].map(([path, token]) => ({
    path,
    type: token.type,
    value: resolve(path, new Set([path])),
  }));
}
