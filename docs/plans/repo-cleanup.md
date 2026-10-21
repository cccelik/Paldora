# Repository cleanup plan

Status: completed (2026-10-21). Behavior-preserving refactor requested by the
owner: remove duplication and bad practice, extract reusable pieces, and make
the repository easier to navigate. Source: three read-only audits (API and
worker, web, packages and repo root).

## Ground rules

- **No behavior change.** Every step ends with all gates green: format, lint,
  typecheck, unit, `contract:check`, `tokens:check`, build, `scan:client-bundle`,
  integration (real services), `test:e2e`, `test:e2e:full`.
- Pure moves are `git mv` so history and blame survive. Import rewrites are
  scripted, then verified with `tsc`.
- Exports of workspace packages keep their public names (`export *` facades), so
  consumers do not change.
- Migrations stay immutable. Splitting `schema.ts` must produce **no** new
  migration (`pnpm db:generate` shows nothing to do).
- `legacy/` is **not** deleted: the Phase 7 parity checkpoint and one stable
  release are still open, and deleting it is an owner decision.
- `.claude/`, `.impeccable/`, `skills-lock.json` and `.graphifyignore` are tool
  configuration and stay where they are.
- `contracts/` and `design/` stay at the root: native apps and CI read them, and
  merging them saves one folder for twelve path edits.

## Steps (strictly sequential)

1. **Packages, root and docs.**
   - Quick wins: worker imports `ACTIVITY_EVENT_TYPES` from `@paldora/domain`;
     use `MEDIA_JOB_TYPES` constants instead of string literals in the worker;
     one set of debounce constants in `apps/web/app/lib/realtime.ts`; delete the
     dead `FRIEND_REQUEST_LIMIT_PER_HOUR`.
   - Split `packages/validation/src/routes.ts` by feature (`routes/`), keeping
     `apiRoutes` key order (`contract:check` proves it) and `routes.ts` as the
     facade. Split `packages/database/src/schema.ts` into `schema/` by domain
     with `schema.ts` as a facade; prove no new migration.
   - Move the two Playwright configs next to the e2e suites, sharing one
     `playwright.shared.ts`; fix `package.json` scripts, `lint`, CI artifact
     paths and `webServer` working directories.
   - Move `REBUILD_PLAN.md` to `docs/rebuild-plan.md`; move delivered plans to
     `docs/plans/delivered/`; fix `openapi.yaml` mentions (the file is
     `openapi.json`); fix ADR 014 status wording; fix stale links.
2. **API helpers and structure.**
   - Shared helpers: `activeMembership` condition, `lockOpenBox(es)`,
     controller support (`Principal`, `PageQuery`, `HOUR`), realtime
     `boxEvent` / `announceDeliveries`, `iso` / `isoOrNull`, `defineError`,
     a `DATABASE` provider replacing the 24 `private get database()` copies,
     `keysetWindow` helper.
   - Keep lock order unchanged (see lock-order comments in life-update-erasure,
     room-top-friends and life-update-delete).
   - Folder layout: `platform/` split into `config`, `http`, `rate-limit`,
     `db`, `route-inventory`; `interactions/` into `comments`, `reactions`,
     `shared`; `rooms/` into `services` and `records`; feature folders stay at
     `src/` top level (no `features/` wrapper). `testing/` becomes `test-support/`.
3. **Test support and test sizes.**
   - Shared fixtures (`createPerson`, `createBox`, `readyMediaAsset`, outbox and
     asset assertions) used by api, worker and database integration tests;
     migrate the local copies. Split the oversized integration test files by
     behavior (block, projector, media-pipeline, schema, rooms).
4. **Web: logic and primitives.**
   - e2e: `e2e/support/` (a11y, console, sessions, accounts, flows, locators,
     rooms) replacing the copies in specs.
   - Actions: `avatar.ts` and `reaction-media.ts` reuse `reservePhotoUpload` and
     `assetStatusOutcome`; one `invalidOutcome`; shared upload schemas; one
     `PreparedUpload` type. `'use server'` files keep async function exports only.
   - Hooks and components: `useSubmitShortcut`, `characterCount`,
     `useActionSuccess`, `useDebouncedCallback`, `HiddenFields`, `BackLink`,
     `Card`, `Stack` in `components/ui`; border and type-scale tokens.
   - Pages: `parsePeriod` in `lib/memories.ts`; one memory-scope page component
     used by personal, Box and Room Memories (privacy codes stay per scope);
     `uuidParam` / `optionalUuid` helpers; shared `*_ABSENT` code lists.
5. **Web: folder structure.**
   - `components/` into feature folders (`ui`, `forms`, `shell`, `common`,
     `realtime`, `auth`, `account`, `media`, `people`, `boxes`, `posts`,
     `life-updates`, `memories`, `interactions`, `notifications`, `rooms`);
     `lib/` into `actions`, `server`, `security`, `media`, `realtime`, `rooms`,
     `interactions`, `life-updates`, `notifications`. `@/` path aliases (TS and
     Vitest). CSS modules co-located; no cross-feature CSS imports (split
     `room-editor.module.css`, `post-card.module.css`). Split `room-widgets.tsx`,
     `memory-timeline.tsx`, `life-update-composer.tsx`. Update the components
     README catalog and AGENTS.md paths.

## Deferred (recorded, not done)

- Deleting `legacy/` (owner decision; tag `legacy-phase7-reference` first).
- Splitting `packages/api-client` into feature modules and moving UI copy out of
  `packages/domain` (needs an i18n decision).
- Injectable clock for services with expiry logic.
- Pruning unused type exports (confirm with knip first).
- Trimming the legacy-oriented sections of `CLAUDE.md` (editorial decision).

## Step 3 implementation

Shared row fixtures now live in `packages/database/src/testing` with a test-only
export and production-import lint guard. API scenes own HTTP relationships;
feature tools reuse the shared media fixtures. Worker support owns storage,
queue, activity, and connection setup. Database support owns constraint fixtures
and error inspection. Block, Box lifecycle, comment lifecycle/summaries, camera,
projector, media fault, maintenance, schema, and Room suites are split by
behavior; the largest integration file is 589 lines.

The reaper test uses the shared historical clock to exclude unrelated expired
reservations from its bounded batch. This changes test setup only. Schema tests
that intentionally omit memberships still create bare Boxes locally; production
policy and migrations are unchanged. The unrelated `.claude/` backup is left
untouched.

Step 3 validation: format, zero-warning lint, typecheck, contract and token
checks, build, and client-bundle scan passed. Unit: 988. Integration: 585 on
each of two consecutive runs (API 418, database 114, worker 47, storage 6).
Browser: 31 passed, one expected skip. Full-stack: 80 passed on rerun; the
first attempt passed 79 and hit a local auth `ECONNRESET` before the remaining
test's privacy assertions. No production behavior was changed to hide it.
Compose returned a nonzero status after the successful one-shot bucket init;
all three services were available and exercised by the gates.

## Step 4 implementation

Browser setup now lives in `e2e/support` (accessibility, console, accounts,
sessions, flows, locators, and Rooms). Upload actions share a prepared type,
file schemas and validation copy, reservation/status helpers, and one invalid
outcome helper. Shared composer shortcuts, character counts, success effects,
and debounce lifecycles replace copies. Hidden fields and BackLink/Card/Stack
primitives own repeated markup; Section composes Card. Memories share their
page frame and period parser, while every route retains its own API calls,
absence codes, UUID case behavior, and not-found timing. ThemeSwatch uses the
`appearance` prop.

Generated hairline, three border-opacity levels, and the existing exact font
sizes replace local values. Fields use the strong border level (50%, raised
from 25%); this is the intended visual normalization, not a layout change.
Before/after Settings and Room customizer screenshots were inspected at 390px
and 1440px: all 18 Settings and 132 customizer measured element rectangles
matched at both widths. Captures remain local in `/tmp/paldora-{before,after}-*`.

Validation: 988 unit tests; integration 585 twice (API 418, database 114,
worker 47, storage 6); browser 31 passed and one expected skip; full-stack 80
passed. Browser support also passed a separate TypeScript check. A stale flow
re-export caught during full-stack discovery was removed before the green run.
No privacy response codes or production behavior changed.

## Step 5 implementation

Components and libraries now use the requested feature folders and the `@/`
alias, configured in TypeScript and Vitest. Tracked files moved with `git mv`.
Room widgets, Memories, and the Life Update composer were split by rendering
responsibility. Thread and Room preview data types live in the library, with
no library-to-component imports. Shared CSS was partitioned by the classes each
rendering owner uses; 94 modules have one owner, with no cross-feature CSS
imports. Catalog and AGENTS.md paths describe the new ownership.

Step 5 validation: format, zero-warning lint, typecheck, contract/token checks,
build and bundle scan passed; unit 988; integration 585 on each of two runs
(API 418, database 114, worker 47, storage 6); browser 31 passed and one expected
skip; full-stack 80 passed. Browser support separately typechecked. Settings
(18 elements) and Room customizer (132 elements) still match the original
measured rectangles at both 390px and 1440px after the CSS partitions. Captures
are `/tmp/paldora-after5-*`. Vitest's `.mts` alias and filesystem-reading test
URLs were corrected during validation. No tests were dropped, and no deferred
cleanup or product feature was implemented.
