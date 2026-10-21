import { expect, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { fullStackEnvironment } from '../playwright.fullstack.config';
import { type Account } from './accounts';
/**
 * Room set-up shared by `rooms.spec.ts` and `room-customize.spec.ts`. What
 * belongs to other features (friends, Boxes, Room settings, the banner
 * upload) goes straight to the API as each person.
 */

export const ROOM_PRESETS = [
  'obsidian_gold',
  'cream_paper',
  'lavender_dream',
  'ocean_glow',
  'daisy_day',
  'neon_night',
  'y2k_glitter',
  'dark_academia',
  'frutiger_aero',
  'tumblr_2014',
  'retro_windows',
  'cyberpunk',
  'minimal_editorial',
  'polaroid_scrapbook',
] as const;

const apiUrl = fullStackEnvironment.NEXT_PUBLIC_API_URL;
const authUrl = fullStackEnvironment.SUPABASE_URL;
const photo = readFileSync(
  fileURLToPath(new URL('../fixtures/photo-with-gps.jpg', import.meta.url)),
);

type Json = Record<string, unknown>;

async function tokenFor(account: Account): Promise<string> {
  const response = await fetch(`${authUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ email: account.email, password: account.password }),
  });
  expect(response.ok).toBe(true);
  return ((await response.json()) as { access_token: string }).access_token;
}

/** One person talking to the API directly. */
export async function apiAs(account: Account) {
  const token = await tokenFor(account);
  const call = async <T = Json>(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<T> => {
    const response = await fetch(`${apiUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    expect(response.ok, `${method} ${path}: ${text}`).toBe(true);
    return (text ? JSON.parse(text) : {}) as T;
  };
  const me = await call<{ user: { id: string } }>('GET', '/me');
  return { call, id: me.user.id, account };
}
export type Person = Awaited<ReturnType<typeof apiAs>>;

export async function befriend(a: Person, b: Person) {
  const request = await a.call<{ id: string }>('POST', '/friend-requests', {
    username: b.account.username,
  });
  await b.call('POST', `/friend-requests/${request.id}/accept`);
}

export async function shareBox(owner: Person, name: string, members: Person[]) {
  const box = await owner.call<{ id: string }>('POST', '/boxes', { name });
  for (const member of members) {
    await owner.call('POST', `/boxes/${box.id}/invitations`, {
      username: member.account.username,
    });
    const invitations = await member.call<{
      items: Array<{ id: string; box: { id: string } }>;
    }>('GET', '/me/box-invitations');
    const invitation = invitations.items.find((item) => item.box.id === box.id);
    await member.call('POST', `/box-invitations/${invitation?.id}/accept`);
  }
  return box.id;
}

export async function updateRoom(person: Person, change: Json) {
  const room = await person.call<{ updatedAt: string | null }>(
    'GET',
    '/me/room',
  );
  return person.call('PATCH', '/me/room', {
    ...change,
    expectedUpdatedAt: room.updatedAt,
  });
}

export async function setTopFriends(person: Person, friends: Person[]) {
  const room = await person.call<{ updatedAt: string | null }>(
    'GET',
    '/me/room',
  );
  await person.call('PUT', '/me/room/top-friends', {
    userIds: friends.map((friend) => friend.id),
    size: 4,
    visibility: 'visible',
    expectedUpdatedAt: room.updatedAt,
  });
}

/** Reserve → PUT → complete → wait for the worker → attach to the Room. */
export async function uploadBanner(person: Person) {
  const reserved = await person.call<{
    mediaAsset: { id: string };
    upload: { url: string; headers: Record<string, string> };
  }>('POST', '/media/uploads', {
    purpose: 'room_banner',
    contentType: 'image/jpeg',
    contentLength: photo.byteLength,
  });
  const put = await fetch(reserved.upload.url, {
    method: 'PUT',
    headers: reserved.upload.headers,
    body: photo,
  });
  expect(put.ok).toBe(true);
  const id = reserved.mediaAsset.id;
  await person.call('POST', `/media/uploads/${id}/complete`);
  await expect
    .poll(
      async () =>
        (await person.call<{ status: string }>('GET', `/media/${id}`)).status,
      { timeout: 30_000 },
    )
    .toBe('ready');
  await updateRoom(person, { bannerMediaId: id });
}

export const canvas = (page: Page) => page.locator('.room-canvas');
export const roomPath = (account: Account) => `/rooms/${account.username}`;

/** Collects Content-Security-Policy reports from the console. */
export function watchCsp(page: Page): string[] {
  const violations: string[] = [];
  page.on('console', (message) => {
    if (/content security policy/i.test(message.text())) {
      violations.push(message.text());
    }
  });
  return violations;
}
