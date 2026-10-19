import 'server-only';

import type { PaldoraApiClient } from '@paldora/api-client';
import { revalidatePath } from 'next/cache';
import type { z } from 'zod';
import { actionError, type ActionOutcome } from './action-result';
import { apiClient } from './session';

export interface RunOptions {
  /** Shown beside the form after success. */
  readonly success: string;
  /** Pages whose data this action changes. */
  readonly paths?: readonly string[];
  /** Product copy for error codes that deserve friendlier words. */
  readonly copy?: Readonly<Partial<Record<string, string>>>;
}

type Work<Input, Output> = (
  api: PaldoraApiClient,
  input: Input,
) => Promise<Output>;

/** Form values as strings. Next adds internal `$ACTION_*` fields; ignore them. */
function stringFields(formData: FormData): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const [name, value] of formData.entries()) {
    if (typeof value === 'string' && !name.startsWith('$'))
      fields[name] = value;
  }
  return fields;
}

const invalid = (message: string): ActionOutcome<never> => ({
  status: 'error',
  code: 'VALIDATION_FAILED',
  message,
  tone: 'attention',
});

/**
 * Server Actions are public endpoints, so every one validates its inputs
 * here and then lets the API decide authorization. Returns the work's result
 * as `data`; use `runForm` when there is nothing to hand back.
 */
export async function runFormWithData<Schema extends z.ZodType, Output>(
  formData: FormData,
  schema: Schema,
  work: Work<z.output<Schema>, Output>,
  options: RunOptions,
): Promise<ActionOutcome<Output>> {
  const parsed = schema.safeParse(stringFields(formData));
  if (!parsed.success) {
    return invalid(
      parsed.error.issues[0]?.message ?? 'Check the details and try again.',
    );
  }
  try {
    const data = await work(await apiClient(), parsed.data);
    for (const path of options.paths ?? []) {
      // A dynamic pattern invalidates every page that matches it.
      if (path.includes('[')) revalidatePath(path, 'page');
      else revalidatePath(path);
    }
    return { status: 'success', message: options.success, data };
  } catch (error) {
    return actionError(error, options.copy);
  }
}

export async function runForm<Schema extends z.ZodType>(
  formData: FormData,
  schema: Schema,
  work: Work<z.output<Schema>, unknown>,
  options: RunOptions,
): Promise<ActionOutcome> {
  const result = await runFormWithData(
    formData,
    schema,
    async (api, input) => {
      await work(api, input);
      return undefined;
    },
    options,
  );
  return result;
}
