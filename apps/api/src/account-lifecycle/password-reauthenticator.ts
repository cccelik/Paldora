import { Inject, Injectable } from '@nestjs/common';
import type { ApiEnvironment } from '@paldora/config';
import { createClient } from '@supabase/supabase-js';
import { API_ENVIRONMENT } from '../platform/config/tokens.js';

export interface PasswordReauthenticator {
  verify(email: string, password: string, subject: string): Promise<boolean>;
}

@Injectable()
export class SupabasePasswordReauthenticator implements PasswordReauthenticator {
  public constructor(
    @Inject(API_ENVIRONMENT) private readonly environment: ApiEnvironment,
  ) {}

  public async verify(
    email: string,
    password: string,
    subject: string,
  ): Promise<boolean> {
    // A fresh client per request keeps temporary auth sessions isolated.
    const client = createClient(
      this.environment.SUPABASE_URL,
      this.environment.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      },
    );
    const { data, error } = await client.auth.signInWithPassword({
      email,
      password,
    });
    return !error && data.session !== null && data.user?.id === subject;
  }
}
