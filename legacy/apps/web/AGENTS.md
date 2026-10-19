<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Paldora web component rules

- Read `app/components/README.md` before adding or restructuring UI.
- Route files load data and compose components; repeated rendering belongs in
  `app/components`.
- Reuse `app/components/ui` primitives before writing equivalent page markup.
- Extract a matching pattern on its second genuine use and export new primitives
  from `app/components/ui/index.ts`.
- Keep primitives as Server Components. Add `'use client'` only at the smallest
  interactive boundary.
- Keep `@paldora/ui` framework-neutral until web and mobile share a rendering
  contract.
