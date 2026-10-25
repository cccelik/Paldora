<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

<!-- END:nextjs-agent-rules -->

## Paldora web rules

Read the root [CLAUDE.md](../../CLAUDE.md) first. These rules add to it.

**Known Next 16 differences that already matter here:**

- Request interception lives in `proxy.ts` (formerly middleware). It runs on the Node runtime and is for optimistic, cookie-only work.
- `error.tsx` receives `retry` (not `reset`).
- `typedRoutes` is stable config.
- `next typegen` generates route types for `tsc`.

**Security:**

- `proxy.ts` sets the **only** Content-Security-Policy. Never add one in `next.config.ts`.
- Production CSP allows no inline styles, so **never use `style={...}` attributes**. Express dynamic presentation through classes or `data-*` attributes.
- Public configuration comes from `app/lib/server/environment.ts`, which validates it. There are no `localhost` fallbacks.
- Server-only credentials never enter the client bundle or page props.
- Authorization is enforced by `@paldora/firebase-trusted` through server-only web data methods. Pages never receive Admin SDK objects or credentials.

**Server Actions** return `ActionResult` (`app/lib/actions/action-result.ts`) to `useActionState`. They never put messages in query strings.

**Components** (catalog: [app/components/README.md](app/components/README.md)):

- Route files load data and compose. Repeated rendering lives in `app/components`.
- Stateless, server-compatible primitives live in `app/components/ui` and are exported from `ui/index.ts`.
- Server Components by default. Put `'use client'` on the smallest interactive leaf.
- Styling uses co-located CSS Modules and the generated `--pal-*` tokens from `@paldora/tokens/tokens.css`. Never hard-code colors.
- Extract at the second genuine use, and search before creating.

**Accessibility:** every page must hold up at desktop and 390px width, provide keyboard access, visible focus, and 44px targets, respect reduced motion, and pass the axe checks in `e2e/`.

**Imports and ownership:** use `@/` for paths under `app/` (also configured in
Vitest). Components are grouped in feature folders; server-compatible primitives
stay in `components/ui`. Library code never imports component definitions or
types: thread and Room preview types live in `lib/interactions` and `lib/rooms`.
Each CSS module has one rendering owner in the same feature or route folder.
