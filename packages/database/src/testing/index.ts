/**
 * Test-only fixtures shared by the API, worker, and database integration
 * suites: rows written straight to PostgreSQL, standing in for flows the
 * suite does not exercise. Never import this from production code.
 */
export * from './people.js';
export * from './media.js';
