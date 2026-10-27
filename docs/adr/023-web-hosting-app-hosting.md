# ADR 023: Web hosting on Firebase App Hosting

Status: Accepted (owner decision 2026-10-27, closes D5). Nothing is deployed.

## Context

The web app (`apps/web`, Next.js 16) is a server-rendered app that verifies a
session cookie and calls `@paldora/firebase-trusted` with Admin credentials.
It needs a host with a server runtime, an attached least-privilege service
account (no key files), a secret store, and HTTPS on one exact origin. The
backend already lives on Firebase (Auth, Firestore, Storage, Functions v2 in
`europe-west4`).

## Decision

- Host the web app on **Firebase App Hosting**, backend root directory
  `apps/web`, region **`europe-west4`** for staging and production. Config:
  `apps/web/apphosting.yaml` plus `apphosting.staging.yaml` and
  `apphosting.production.yaml` (`pnpm hosted:check` guards them).
- Functions stay in `europe-west4`; `firebase.json` gains a `functions` block
  (codebase `paldora`). Deploys always name the project explicitly.
- Secrets are Secret Manager names referenced from the YAML. Values never enter
  the repository. `NEXT_PUBLIC_*` is limited to `NEXT_PUBLIC_WEB_URL`.
- Separate staging and production projects. `paldora-dev` stays Spark and
  receives no App Hosting backend.

## Alternatives rejected

- **Cloud Run directly.** Maximum control, but we would own the container
  build, the revision/rollback workflow and the Git-triggered build pipeline for
  a solo operator, with no benefit that matters at beta scale. Remains the
  fallback (App Hosting runs on Cloud Run).
- **Vercel.** Strong Next.js support, but it adds a second vendor and account
  and a cross-cloud credential problem: the server needs Google Admin
  credentials without key files, which pushes toward long-lived keys or
  workload identity federation. Rejected for the privacy-first, no-key-files
  posture.

## Trade-offs

- Requires the Blaze plan (billing) for staging and production.
- Younger product than Cloud Run/Vercel; behavior around pnpm/Turborepo
  builds, Node 24, cold starts and rollback is unverified here.
- Config format is vendor specific; `apphosting.<env>.yaml` overlay naming and
  precedence must be rechecked against current docs before first use.
- Fewer knobs than raw Cloud Run (for example no custom edge rules).

## Unverified (verify against current official docs)

pnpm workspace builds with `apps/web` root; Node 24 in the build image;
`europe-west4` availability on the creation date (listed 2026-10-27); overlay
file selection by backend environment name; cold-start latency with
`minInstances: 0`; rollback and rollout commands; custom-domain TLS; the
`nodejs24` Functions runtime and the `workspace:*` packaging gap noted in
`docs/deployment.md`.

## Revisit triggers

Revisit if the App Hosting build cannot build the pnpm workspace reliably, if
cold starts or limits break the beta experience, if cost exceeds the budget set
in the staging checklist (section C), if we need edge controls App Hosting
cannot provide (staging checklist H), or if Firebase changes App Hosting
availability in `europe-west4`.
