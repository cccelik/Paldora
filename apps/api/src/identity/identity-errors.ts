import { HttpStatus } from '@nestjs/common';
import { ApiError, defineError } from '../platform/http/api-error.js';

export const usernameUnavailable = defineError(
  HttpStatus.CONFLICT,
  'USERNAME_UNAVAILABLE',
  'That username is unavailable.',
);

export const onboardingIncomplete = (message: string) =>
  new ApiError(HttpStatus.BAD_REQUEST, 'ONBOARDING_INCOMPLETE', message);

export const invalidOnboardingTransition = defineError(
  HttpStatus.BAD_REQUEST,
  'INVALID_ONBOARDING_TRANSITION',
  'Completed setup steps cannot be reopened.',
);
