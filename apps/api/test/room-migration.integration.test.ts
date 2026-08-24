import {
  createDatabaseConnection,
  type DatabaseConnection,
} from '@paldora/database';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const databaseUrl = process.env.DATABASE_URL;
// Drizzle's journal timestamp for 0014_wide_luckman. Only profiles that existed
// when the backfill ran belong in this assertion; other integration suites
// create completed profiles concurrently and RoomService provisions those on
// demand instead.
const roomBackfillCreatedAt = new Date(1_787_564_026_239);

describe.runIf(Boolean(databaseUrl))('Room migration backfill', () => {
  let connection: DatabaseConnection;

  beforeAll(() => {
    connection = createDatabaseConnection(databaseUrl as string);
  });

  afterAll(async () => connection.close());

  it('backfills a default Room, preferences, and seven widgets for every completed profile', async () => {
    const missing = await connection.pool.query<{ count: string }>(
      `
      select count(*)
      from paldora.profiles profiles
      left join paldora.rooms rooms on rooms.user_id = profiles.user_id
      left join paldora.user_preferences preferences on preferences.user_id = profiles.user_id
      where profiles.onboarding_state = 'complete'
        and profiles.created_at <= $1
        and (rooms.user_id is null or preferences.user_id is null)
    `,
      [roomBackfillCreatedAt],
    );
    const malformed = await connection.pool.query<{ count: string }>(
      `
      select count(*)
      from paldora.rooms rooms
      join paldora.profiles profiles on profiles.user_id = rooms.user_id
      left join paldora.room_widgets widgets on widgets.room_user_id = rooms.user_id
      where profiles.onboarding_state = 'complete'
        and profiles.created_at <= $1
      group by rooms.user_id
      having count(widgets.widget_type) <> 7
    `,
      [roomBackfillCreatedAt],
    );
    expect(missing.rows[0]?.count).toBe('0');
    expect(malformed.rowCount).toBe(0);
  });
});
