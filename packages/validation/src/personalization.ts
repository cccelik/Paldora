import { z } from 'zod';
import { isoTimestampSchema } from './primitives.js';
const source = z
  .string()
  .max(8192)
  .refine(
    (value) => new TextEncoder().encode(value).length <= 8192,
    'Source exceeds 8 KiB',
  );
export const customWidgetSourceSchema = z
  .object({ title: z.string().trim().min(1).max(80), source })
  .strict();
const sources = {
  cssSource: source,
  widgets: z.array(customWidgetSourceSchema).max(3),
};
export const updatePersonalizationSchema = z
  .object({ ...sources, expectedUpdatedAt: isoTimestampSchema.nullable() })
  .strict();
export const personalizationSourceSchema = z
  .object({ ...sources, cssEnabled: z.boolean(), widgetsEnabled: z.boolean() })
  .strict();
export const renderedPersonalizationSchema = z
  .object({
    css: z.string().max(32768),
    widgets: z
      .array(
        z
          .object({
            title: z.string().max(80),
            document: z.string().max(40000),
          })
          .strict(),
      )
      .max(3),
  })
  .strict();
export type UpdatePersonalizationInput = z.infer<
  typeof updatePersonalizationSchema
>;
export type PersonalizationSource = z.infer<typeof personalizationSourceSchema>;
export type RenderedPersonalization = z.infer<
  typeof renderedPersonalizationSchema
>;
