import { RequestMethod, type Type } from '@nestjs/common';
import {
  HTTP_CODE_METADATA,
  METHOD_METADATA,
  MODULE_METADATA,
  PATH_METADATA,
} from '@nestjs/common/constants.js';
import { IS_PUBLIC_KEY } from '../auth/public.decorator.js';
import {
  RATE_LIMIT_EXEMPT_KEY,
  RATE_LIMIT_KEY,
} from '../rate-limit/rate-limit.decorator.js';

export interface InventoriedRoute {
  readonly handler: string;
  readonly method: string;
  /** Contract-style path relative to `/api/v1`, e.g. `/boxes/{boxId}`. */
  readonly path: string;
  /** The status Nest sends on success (POST defaults to 201, others 200). */
  readonly successStatus: number;
  readonly isPublic: boolean;
  readonly hasRateLimit: boolean;
  readonly rateLimitExemption: string | undefined;
}

const joinPath = (...parts: string[]) =>
  `/${parts
    .flatMap((part) => part.split('/'))
    .filter(Boolean)
    .map((segment) => segment.replace(/^:(\w+)$/, '{$1}'))
    .join('/')}`;

function controllersOf(moduleClass: Type, seen = new Set<Type>()): Type[] {
  if (seen.has(moduleClass)) return [];
  seen.add(moduleClass);
  const own = (Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, moduleClass) ??
    []) as Type[];
  const imports = (Reflect.getMetadata(MODULE_METADATA.IMPORTS, moduleClass) ??
    []) as Type[];
  return [...own, ...imports.flatMap((child) => controllersOf(child, seen))];
}

function routesOf(controller: Type): InventoriedRoute[] {
  const base = String(Reflect.getMetadata(PATH_METADATA, controller) ?? '');
  const classPublic = Reflect.getMetadata(IS_PUBLIC_KEY, controller) === true;
  const prototype = controller.prototype as Record<string, unknown>;
  return Object.getOwnPropertyNames(prototype).flatMap((name) => {
    const handler = prototype[name];
    if (typeof handler !== 'function' || name === 'constructor') return [];
    const method = Reflect.getMetadata(METHOD_METADATA, handler) as
      RequestMethod | undefined;
    if (method === undefined) return [];
    const httpCode = Reflect.getMetadata(HTTP_CODE_METADATA, handler) as
      number | undefined;
    return [
      {
        handler: `${controller.name}.${name}`,
        method: RequestMethod[method],
        path: joinPath(
          base,
          String(Reflect.getMetadata(PATH_METADATA, handler)),
        ),
        successStatus: httpCode ?? (method === RequestMethod.POST ? 201 : 200),
        isPublic:
          classPublic || Reflect.getMetadata(IS_PUBLIC_KEY, handler) === true,
        hasRateLimit:
          Reflect.getMetadata(RATE_LIMIT_KEY, handler) !== undefined,
        rateLimitExemption: Reflect.getMetadata(
          RATE_LIMIT_EXEMPT_KEY,
          handler,
        ) as string | undefined,
      },
    ];
  });
}

/** Statically lists every HTTP route reachable from a root module. */
export function inventoryRoutes(rootModule: Type): InventoriedRoute[] {
  return controllersOf(rootModule).flatMap(routesOf);
}
