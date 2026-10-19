import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'paldora:isPublic';

/**
 * Opts a handler out of the global authentication guard. Every use must match
 * an `access: 'public'` route in the contract registry; the route-inventory
 * test fails otherwise. Being public never implies authorization to data.
 */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
