import { HttpStatus } from '@nestjs/common';
import { ApiError } from '../platform/api-error.js';

export const usernameUnavailable = () =>
  new ApiError(
    HttpStatus.CONFLICT,
    'USERNAME_UNAVAILABLE',
    'That username is unavailable.',
  );

export const onboardingIncomplete = (message: string) =>
  new ApiError(HttpStatus.BAD_REQUEST, 'ONBOARDING_INCOMPLETE', message);

export const invalidOnboardingTransition = () =>
  new ApiError(
    HttpStatus.BAD_REQUEST,
    'INVALID_ONBOARDING_TRANSITION',
    'Completed setup steps cannot be reopened.',
  );
