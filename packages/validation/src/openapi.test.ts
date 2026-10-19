import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildOpenApiDocument } from './openapi.js';
import { defineRoute } from './route.js';
import { apiRoutes } from './routes.js';

describe('route registry', () => {
  it('uses unique operation IDs and method/path pairs', () => {
    const routes = Object.values(apiRoutes);
    const operations = new Set(routes.map((route) => route.operationId));
    const endpoints = new Set(
      routes.map((route) => `${route.method} ${route.path}`),
    );
    expect(operations.size).toBe(routes.length);
    expect(endpoints.size).toBe(routes.length);
  });

  it('keys every route by its operation ID', () => {
    for (const [key, route] of Object.entries(apiRoutes)) {
      expect(route.operationId).toBe(key);
    }
  });
});

describe('OpenAPI document', () => {
  const widget = z.object({ id: z.uuid(), name: z.string() }).meta({
    id: 'Widget',
  });
  const document = buildOpenApiDocument(
    {
      updateWidget: defineRoute({
        operationId: 'updateWidget',
        method: 'PATCH',
        path: '/widgets/{widgetId}',
        summary: 'Rename a widget.',
        tag: 'Widgets',
        access: 'authenticated',
        successStatus: 200,
        response: widget,
        body: z.object({ name: z.string().min(1) }),
        query: z.object({ dryRun: z.boolean().optional() }),
        errors: ['NOT_FOUND'],
      }),
    },
    { title: 'Test', version: '1' },
  );
  const paths = document.paths as Record<
    string,
    Record<string, Record<string, unknown>>
  >;
  const operation = paths['/widgets/{widgetId}']?.patch ?? {};

  it('declares bearer security and documents stable error codes', () => {
    expect(operation.security).toEqual([{ bearerAuth: [] }]);
    const responses = operation.responses as Record<
      string,
      { description: string }
    >;
    expect(responses.default?.description).toMatch(
      /AUTHENTICATION_REQUIRED, ACCOUNT_NOT_PROVISIONED, ACCOUNT_BLOCKED, NOT_FOUND/,
    );
  });

  it('emits path and query parameters and a request body', () => {
    expect(operation.parameters).toEqual([
      expect.objectContaining({ name: 'widgetId', in: 'path' }),
      expect.objectContaining({ name: 'dryRun', in: 'query', required: false }),
    ]);
    expect(operation.requestBody).toBeDefined();
  });

  it('references named response schemas as components', () => {
    const components = document.components as {
      schemas: Record<string, unknown>;
    };
    expect(Object.keys(components.schemas)).toEqual([
      'ErrorEnvelope',
      'Widget',
    ]);
  });
});
