import { eq } from 'drizzle-orm';
import {
  roomCustomizations,
  roomCustomWidgets,
  rooms,
} from '@paldora/database';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { createTestApp, type TestApp } from '../../test-support/test-app.js';
import { expectError, json } from '../../test-support/http.js';
let app: TestApp;
beforeAll(async () => {
  app = await createTestApp();
});
afterAll(() => app.close());
it('defaults both kill switches off, hides saved artifacts and rejects changes', async () => {
  const owner = await app.person();
  await app.database.insert(rooms).values({ userId: owner.id });
  await app.database.insert(roomCustomizations).values({
    roomUserId: owner.id,
    policyVersion: 1,
    cssSource: '.room-title{font-weight:700}',
  });
  await app.database.insert(roomCustomWidgets).values({
    roomUserId: owner.id,
    position: 0,
    policyVersion: 1,
    title: 'Hello',
    source: '<p>Hello</p>',
  });
  expect(
    await json(
      await app.request(owner, `/rooms/${owner.username}/personalization`),
    ),
  ).toEqual({ css: '', widgets: [] });
  expect(
    await json(await app.request(owner, '/me/room/personalization')),
  ).toMatchObject({ cssEnabled: false, widgetsEnabled: false });
  await expectError(
    await app.request(owner, '/me/room/personalization', {
      method: 'PUT',
      body: { expectedUpdatedAt: null, cssSource: '', widgets: [] },
    }),
    400,
    'VALIDATION_FAILED',
  );
});

it.each([
  { css: true, widgets: false },
  { css: false, widgets: true },
])(
  'keeps disabled policy/source untouched while saving the independent surface: %j',
  async (flags) => {
    const isolated = await createTestApp(flags);
    try {
      const owner = await isolated.person();
      await isolated.database.insert(rooms).values({ userId: owner.id });
      const cssSource = flags.css ? '' : 'body{position:fixed}';
      const widgets = [
        {
          title: 'Old',
          source: flags.widgets ? '<p>Text</p>' : '<script>bad()</script>',
        },
      ];
      await isolated.database
        .insert(roomCustomizations)
        .values({ roomUserId: owner.id, policyVersion: 2, cssSource });
      await isolated.database.insert(roomCustomWidgets).values({
        roomUserId: owner.id,
        position: 0,
        policyVersion: 2,
        ...widgets[0]!,
      });
      const room = await json<{ updatedAt: string }>(
        await isolated.request(owner, '/me/room'),
      );
      await json(
        await isolated.request(owner, '/me/room/personalization', {
          method: 'PUT',
          body: {
            cssSource: flags.css ? '.room-title{font-weight:700}' : cssSource,
            widgets: flags.widgets
              ? [{ title: 'New', source: '<p>New note</p>' }]
              : widgets,
            expectedUpdatedAt: room.updatedAt,
          },
        }),
      );
      const source = await json<{ cssSource: string; widgets: typeof widgets }>(
        await isolated.request(owner, '/me/room/personalization'),
      );
      expect(source.cssSource).toBe(
        flags.css ? '.room-title{font-weight:700}' : cssSource,
      );
      expect(source.widgets).toEqual(
        flags.widgets ? [{ title: 'New', source: '<p>New note</p>' }] : widgets,
      );
      const [cssRow] = await isolated.database
        .select()
        .from(roomCustomizations)
        .where(eq(roomCustomizations.roomUserId, owner.id));
      const [widgetRow] = await isolated.database
        .select()
        .from(roomCustomWidgets)
        .where(eq(roomCustomWidgets.roomUserId, owner.id));
      expect(cssRow?.policyVersion).toBe(flags.css ? 1 : 2);
      expect(widgetRow?.policyVersion).toBe(flags.widgets ? 1 : 2);
      const result = await json<{ css: string; widgets: unknown[] }>(
        await isolated.request(
          owner,
          `/rooms/${owner.username}/personalization`,
        ),
      );
      expect(Boolean(result.css)).toBe(flags.css);
      expect(result.widgets.length).toBe(flags.widgets ? 1 : 0);
    } finally {
      await isolated.close();
    }
  },
);
