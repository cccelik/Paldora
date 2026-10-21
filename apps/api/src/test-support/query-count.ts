import { createRequire } from 'node:module';

/** Every query this process sends to PostgreSQL, counted while `run` runs. */
export async function countQueries(
  run: () => Promise<unknown>,
): Promise<number> {
  const pg = createRequire(
    new URL('../../../../packages/database/package.json', import.meta.url),
  )('pg') as {
    Client: { prototype: { query: (...args: unknown[]) => unknown } };
  };
  const prototype = pg.Client.prototype;
  const original = prototype.query;
  let count = 0;
  prototype.query = function counted(this: unknown, ...args: unknown[]) {
    count += 1;
    return original.apply(this, args);
  };
  try {
    await run();
  } finally {
    prototype.query = original;
  }
  return count;
}
