import { z } from 'zod';
import { errorEnvelopeSchema } from './errors.js';
import type { RouteDefinition } from './route.js';

type JsonObject = Record<string, unknown>;

const globalErrorCodes = [
  'VALIDATION_FAILED',
  'RATE_LIMITED',
  'RATE_LIMIT_UNAVAILABLE',
  'INTERNAL_ERROR',
] as const;

/** Every authenticated route maps the token to an active provisioned user. */
const authenticatedErrorCodes = [
  'AUTHENTICATION_REQUIRED',
  'ACCOUNT_NOT_PROVISIONED',
  'ACCOUNT_BLOCKED',
] as const;

function jsonSchema(
  schema: z.ZodType,
  io: 'input' | 'output',
  components: JsonObject,
): JsonObject {
  const result = z.toJSONSchema(schema, {
    target: 'draft-2020-12',
    io,
    unrepresentable: 'throw',
    reused: 'inline',
  }) as JsonObject;
  delete result.$schema;
  const id = schema.meta()?.id;
  if (typeof id !== 'string' || io === 'input') return result;
  components[id] = result;
  return { $ref: `#/components/schemas/${id}` };
}

function queryParameters(schema: z.ZodType | undefined): JsonObject[] {
  if (!schema) return [];
  const result = z.toJSONSchema(schema, { io: 'input' }) as {
    properties?: Record<string, JsonObject>;
    required?: string[];
  };
  return Object.entries(result.properties ?? {}).map(([name, property]) => ({
    name,
    in: 'query',
    required: result.required?.includes(name) ?? false,
    schema: property,
  }));
}

function pathParameters(path: string): JsonObject[] {
  return [...path.matchAll(/\{(\w+)\}/g)].map(([, name]) => ({
    name,
    in: 'path',
    required: true,
    schema: { type: 'string', format: 'uuid' },
  }));
}

function errorDescription(route: RouteDefinition): string {
  const codes = [
    ...(route.access === 'authenticated' ? authenticatedErrorCodes : []),
    ...route.errors,
    ...globalErrorCodes,
  ];
  return `Error envelope. Possible codes: ${[...new Set(codes)].join(', ')}.`;
}

function operation(route: RouteDefinition, components: JsonObject): JsonObject {
  const success =
    route.successStatus === 204
      ? { description: 'No content.' }
      : {
          description: 'Success.',
          content: {
            [route.stream ? 'text/event-stream' : 'application/json']: {
              schema: jsonSchema(route.response, 'output', components),
            },
          },
        };
  return {
    operationId: route.operationId,
    summary: route.summary,
    tags: [route.tag],
    ...(route.access === 'authenticated'
      ? { security: [{ bearerAuth: [] }] }
      : { security: [] }),
    parameters: [
      ...pathParameters(route.path),
      ...queryParameters(route.query),
    ],
    ...(route.body
      ? {
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: jsonSchema(route.body, 'input', components),
              },
            },
          },
        }
      : {}),
    responses: {
      [route.successStatus]: success,
      default: {
        description: errorDescription(route),
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/ErrorEnvelope' },
          },
        },
      },
    },
  };
}

/**
 * Builds the language-neutral OpenAPI 3.1 document consumed by the native
 * clients. Output is deterministic so CI can fail on uncommitted drift.
 */
export function buildOpenApiDocument(
  routes: Readonly<Record<string, RouteDefinition>>,
  info: { title: string; version: string },
): JsonObject {
  const components: JsonObject = {
    ErrorEnvelope: jsonSchema(errorEnvelopeSchema, 'output', {}),
  };
  const paths: Record<string, JsonObject> = {};
  const sorted = Object.values(routes).sort((left, right) =>
    `${left.path} ${left.method}`.localeCompare(
      `${right.path} ${right.method}`,
    ),
  );
  for (const route of sorted) {
    paths[route.path] ??= {};
    const pathItem = paths[route.path] as JsonObject;
    pathItem[route.method.toLowerCase()] = operation(route, components);
  }
  return {
    openapi: '3.1.0',
    info,
    servers: [{ url: '/api/v1' }],
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(components).sort(([left], [right]) =>
          left.localeCompare(right),
        ),
      ),
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
    },
  };
}
