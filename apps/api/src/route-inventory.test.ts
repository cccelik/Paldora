import 'reflect-metadata';
import { apiRoutes } from '@paldora/validation';
import { describe, expect, it } from 'vitest';
import { AppModule } from './app.module.js';
import { inventoryRoutes } from './platform/route-inventory.js';

const routes = inventoryRoutes(AppModule);
const contract = Object.values(apiRoutes);
const key = (route: { method: string; path: string }) =>
  `${route.method} ${route.path}`;

describe('route inventory', () => {
  it('exposes exactly the routes in the contract registry', () => {
    expect(routes.map(key).sort()).toEqual(contract.map(key).sort());
  });

  it('marks a route public only when the contract says so', () => {
    for (const route of routes) {
      const declared = contract.find((entry) => key(entry) === key(route));
      expect(
        route.isPublic,
        `${route.handler} public flag must match the contract`,
      ).toBe(declared?.access === 'public');
    }
  });

  it('sends the success status the contract declares', () => {
    for (const route of routes) {
      const declared = contract.find((entry) => key(entry) === key(route));
      expect(
        route.successStatus,
        `${route.handler} success status must match the contract`,
      ).toBe(declared?.successStatus);
    }
  });

  it('records a rate-limit decision for every mutating route', () => {
    const undecided = routes.filter(
      (route) =>
        route.method !== 'GET' &&
        !route.hasRateLimit &&
        !route.rateLimitExemption,
    );
    expect(undecided.map((route) => route.handler)).toEqual([]);
  });
});
