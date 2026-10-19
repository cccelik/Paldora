# Development

Use Node.js 22 or newer and the pnpm version pinned in the root `package.json`.

```bash
corepack enable
pnpm install
cp .env.example .env
docker compose -f infrastructure/docker-compose.yml up -d
pnpm db:migrate
pnpm dev
```

Run a single application with `pnpm --filter @paldora/web dev`, `pnpm --filter @paldora/api dev`, `pnpm --filter @paldora/worker dev`, or `pnpm --filter @paldora/mobile dev`.

Before opening a pull request run `pnpm format:check`, `pnpm lint`, `pnpm typecheck`, `pnpm test`, and `pnpm build`. Browser tests use `pnpm test:e2e`. A test database must be isolated from development and production data.

Keep controllers thin, business rules in domain/services, database access behind repositories, and shared packages acyclic. Do not weaken strict TypeScript rules or use `any` to bypass a contract.

Production TypeScript is guarded against excessive cyclomatic complexity,
nesting depth, function length, and parameter lists. Exceptions are allowed
only for an inherent protocol state machine or sequential stream loop and must
carry a local explanation. Before adding a component, search the web component
catalog in `apps/web/app/components/README.md`; route files should load data and
compose reusable sections rather than own repeated product markup.

## Phase 1 local setup

1. Set the hosted development Supabase URL, anonymous key, and service-role key in `.env`. Never use a production service-role key locally.
2. Enable email/password in Supabase Auth, set the Site URL to
   `http://localhost:3000`, and add
   `http://localhost:3000/auth/callback**` to the redirect allow list. For a
   recovery link that works even when the email is opened in another browser,
   set the Recovery email template link to:

   ```html
   <a
     href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password"
     >Reset password</a
   >
   ```

   Paldora continues to accept Supabase's existing PKCE `code` callback links,
   but those depend on the browser cookie created when the reset was requested.

3. Start PostgreSQL, Redis, and private MinIO with the Docker Compose command above. MinIO creates `paldora-private` and applies local browser-upload CORS.
4. Run `pnpm db:migrate`, set a non-committed demo password and a real demo inbox, then run `pnpm seed:demo`.
5. Run `pnpm dev` and sign in with the provisioned demo account. No registration screen exists.

Supabase's built-in SMTP service only delivers to email addresses belonging to
members of the project's organization and is limited to two messages per hour.
Use your organization-member email for the hosted-development reset test, or
configure custom SMTP under Authentication settings. If a placeholder demo was
already seeded, provision a second account with the real email and a different
`DEMO_USERNAME` to avoid colliding with the first profile.

With the development web server running, `pnpm design:capture:phase1` refreshes the implementation-accurate auth/settings artboards.

## Phase 2 social testing

Phase 2 adds private Boxes, explicit memberships, Box invitations, friend
requests, and blocking. To test a two-person flow, optionally set all four
`DEMO_FRIEND_*` values in the uncommitted `.env` and rerun `pnpm seed:demo`.
The command is idempotent and provisions both accounts as verified users.

Use two browser profiles (for example, a normal window and a private window):

1. Sign in as the first account, open **Friends**, and request the second
   account by its exact username.
2. Sign in as the second account and accept the request.
3. Create a Box from either account and invite the accepted friend from the
   quick list, or invite any provisioned account directly by username.
4. Sign in as the invitee and accept the Box invitation.
5. As the owner, rename and archive/restore the Box from **Box settings**.
6. Transfer ownership from the member's `…` menu. Confirm the former owner is
   now an admin and can leave while the new owner cannot leave without another
   transfer.
7. Verify only the current owner sees the permanent-delete control. It requires
   the exact Box name and a second browser confirmation before deleting all
   memberships, invitations, and Box-owned content.

Boxes are private and deny access to non-members.

Redis enforces per-user mutation limits in local and deployed environments: 20
friend requests and 60 Box invitations per hour. Flush only the dedicated
`paldora:rate-limit:*` keys when intentionally resetting local test state.

Run `pnpm test:e2e:hosted` for the hosted Supabase smoke gate. It loads the
uncommitted `.env`, starts/reuses the API and web servers, and verifies every
configured demo account can sign in, access Boxes/Friends, and sign out. The
normal `pnpm test:e2e` suite remains credential-free.

Set `PLAYWRIGHT_API_PORT` and `PLAYWRIGHT_WEB_PORT` to run the hosted gate in
isolation from active development servers. The Docker MinIO configuration
allows the default isolated web port `3100`; recreate MinIO after changing its
CORS origins. Hosted runs also derive an isolated BullMQ queue name from the
API port so a development worker cannot consume jobs belonging to the test
database. Deployed environments sharing Redis must likewise use distinct
`MEDIA_JOB_QUEUE_NAME` values.

## Phase 3A post testing

Use the same two browser profiles after completing the Phase 2 flow:

1. Publish text from both members inside their shared active Box.
2. Confirm both posts appear newest-first in the Box and on each member's Home.
3. Edit and delete one of your own posts; confirm the other member has no edit
   or delete controls and that deletion removes the post from both feeds.
4. Archive the Box as its owner. Existing posts stay readable, but the composer
   is replaced by a read-only notice. Restore it to publish again.
5. Remove or leave as one member and confirm that account can no longer read the
   Box or its posts, including by pasting a known identifier.
6. Permanently delete the Box and confirm its posts disappear with it.

The normal unit suite uses no credentials. Database integration tests require
the local Docker PostgreSQL service and the uncommitted `DATABASE_URL`; run
`node --env-file=.env apps/api/node_modules/vitest/vitest.mjs run
apps/api/test/post-flow.integration.test.ts` after applying migrations.

## Phase 3B realtime testing

Keep the same shared Box open in two browser profiles, and keep Home open in a
second tab for one profile. Publish, edit, and delete a post in one profile;
the other profile should reconcile both its Box and Home feeds without a manual
refresh. Stop Redis to confirm posting still succeeds, then restart it and
confirm the browser reconnects with bounded backoff. Removing a member must
prevent that account from receiving later events for that Box.

Realtime browser requests use the exact `WEB_ORIGIN`. Open the site through that
configured origin (normally `http://localhost:3000`), not an alternate hostname.
The hosted smoke suite creates and removes a temporary shared Box to verify
actual two-account delivery without leaving test content behind.

## Phase 3C image-post testing

Apply migrations through `0006`, then keep API, web, worker, PostgreSQL, Redis, and MinIO
running. In an active Box, expand the composer and select up to four JPEG, PNG,
or WebP images no larger than 10 MB each. Local previews should be removable.
After sharing, the feed may briefly show a processing placeholder before the
worker-created image appears in both the Box and Home feeds. Deleting the post
or Box must enqueue deletion of the original, display, and thumbnail objects.
Selecting a ready image opens the fullscreen viewer without a new tab. Verify
Escape/Close, Save, Share, and multi-photo previous/next controls at desktop and
390px widths; shared links must use `/posts/:id`, not a storage URL.

Media jobs are durable in PostgreSQL. To exercise recovery, stop Redis, upload
or delete media, and confirm a pending row exists in
`paldora.media_job_outbox`. Restart Redis and the API; the dispatcher should
publish the row, the worker should process it, and `published_at` should become
non-null. Permanent Box deletion snapshots object keys in the outbox before
the `media_assets.box_id` cascade removes the metadata.

## Phase 5 interaction testing

Apply migrations through `0007`, then open one shared Box in two browser
profiles. Add a comment, reply once, edit/delete your own comment, and set,
change, and remove each reaction. Both Box and Home summaries should update
without a manual refresh. Replies to replies must be rejected. Remove one
member, delete a post, and block the other account to confirm interaction and
notification access is revoked without leaking identifiers.

The notification center must update its unread badge and rows in realtime. Stop
Redis, create an interaction, then restart Redis and the API: the durable
activity row must project once and reconnecting browsers must reconcile from the
authorized API. Run `node --env-file=.env
apps/api/node_modules/vitest/vitest.mjs run
apps/api/test/interaction-flow.integration.test.ts` for concurrent reaction,
notification dedupe, block, membership, deletion, and cursor coverage.

## Phase 7 Room testing

Apply migrations through `0015`. Open one Room as its owner, an accepted friend,
an unrelated provisioned member, and a blocked account. Exercise Friends Only,
Paldora Members, and Hidden; inaccessible cases must remain indistinguishable.
Change all 14 themes, reorder widgets with drag-and-drop and keyboard controls,
save Top 4/8/12, validate HTTPS music, replace/delete a banner, and reload to
confirm appearance and Room settings persist. Remove a friendship and block a
selected friend to verify both Top Friends references disappear atomically.

Run `node --env-file=.env apps/api/node_modules/vitest/vitest.mjs run
apps/api/test/room-flow.integration.test.ts` for database authorization,
concurrency, Top Friends, and banner coverage. With the web development server
running, generate implementation-derived artboards with
`pnpm design:capture:phase7`.
