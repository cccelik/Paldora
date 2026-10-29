# Staging bring-up runbook

Ordered, **owner-run** steps to create the first hosted environment. Nothing
here has been run. Every step flagged **OWNER ACTION** touches a hosted project,
billing or credentials and must be done by the owner, never by CI or an agent.
Section letters refer to the [staging checklist](staging-checklist.md). Hosting
decision: [ADR 023](../adr/023-web-hosting-app-hosting.md). Topology:
[deployment](../deployment.md). Anything marked **verify** must be rechecked
against current official Firebase/Google Cloud docs first.

Placeholders: `<STAGING>` is the real staging project id you create. Do not
commit it to `.firebaserc`; use `firebase use --add` locally.

## 0. Gate (local, no hosted effect)

1. `pnpm hosted:check && pnpm hosted:test` must pass first. It rejects emulator
   hosts, `demo-` ids, `dev_only`, literal secrets, a wrong `PALDORA_ENV`, a
   non-`europe-west4` Functions region, non-deny rules and native config.
2. Run the standard gates (checklist A): format, lint, typecheck, test,
   `tokens:check`, `contract:native:check`, `firebase:parity:check`, build,
   `scan:client-bundle`. Emulator suites are run by their owners, not here.

## 1. Project and billing (checklist B, C)

3. **OWNER ACTION.** Create a new Firebase/GCP project `<STAGING>`, separate
   from `paldora-dev`.
4. **OWNER ACTION. Budget and alerts first.** In Cloud Billing create the
   budget with threshold alerts to at least two people **before** enabling
   Blaze on the project. Alerts notify; they do not cap spend (**verify** any
   automatic cap).
5. **OWNER ACTION.** Link billing / upgrade to Blaze (needed for scheduled
   functions, Cloud Tasks, Storage and App Hosting). Record the billing owner.
6. **OWNER ACTION.** Locally: `firebase use --add` and pick `<STAGING>` with an
   alias such as `staging`. Always pass `--project <STAGING>` explicitly on
   later commands. No default alias.

## 2. Services (checklist B, E, G)

7. **OWNER ACTION.** Auth: enable Email/Password only; no other provider. Turn
   off self-service sign-up if the console offers it (**verify**).
8. **OWNER ACTION.** Firestore: create the database in `europe-west4`
   (**verify** location support).
9. **OWNER ACTION.** Storage: create the default bucket in `europe-west4`,
   private, uniform bucket-level access, no public access (**verify**).
10. **OWNER ACTION. Rules and indexes** (via `firebase.json` only, never
    `firebase.native.json`):
    `firebase deploy --only firestore:rules,firestore:indexes,storage --project <STAGING>`.
    Wait until every index is ready. Confirm client SDK access is denied.

## 3. Functions (checklist F)

11. The deploy artifact is a generated bundle (`pnpm functions:prepare`, run
    by the `firebase.json` predeploy; see deployment.md "Functions deploy
    artifact"). Run `pnpm functions:bundle:test` first and confirm it passes.
    After the deploy, confirm Cloud Build installs `sharp` for the runtime
    platform (first hosted verification).
12. **OWNER ACTION.** Cloud Tasks API enabled and, if required, queue/IAM for
    `executeMediaJob` (**verify**). Confirm runtime `nodejs24` is accepted
    (**verify**; fallback `nodejs22` in `firebase.json` and `engines`).
13. **OWNER ACTION.** `firebase deploy --only functions --project <STAGING>`.
    Confirm all ten functions exist in `europe-west4` and scheduled functions
    log `*.completed`.

## 4. Web: App Hosting (checklist B, D, J)

14. **OWNER ACTION.** Secret: `firebase apphosting:secrets:set
paldora-firebase-web-api-key --project <STAGING>` (paste the Web API key
    when prompted; never in a file, chat or commit).
15. **OWNER ACTION.** Create the backend:
    `firebase apphosting:backends:create --project <STAGING> --location europe-west4`
    with root directory `apps/web` and the environment name `staging` so
    `apphosting.staging.yaml` applies (**verify** naming and the root-directory
    prompt). Use a dedicated service account (not the default compute account)
    and grant it only: Firestore access, Auth access for session verification,
    Storage object access, Secret Manager secret accessor on the one secret, and
    the App Hosting runtime role. Record the exact roles (**verify** role names).
16. **OWNER ACTION.** Add the three per-environment values (real project id,
    the backend's exact HTTPS origin and the contact mailbox) to `apps/web/apphosting.staging.yaml`
    (`FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_WEB_URL`, and `NEXT_PUBLIC_CONTACT_EMAIL`,
    the monitored reports and appeals mailbox shown on `/contact`, a plain
    address that web requests fail closed without; `FIREBASE_STORAGE_BUCKET` only
    if the bucket is not the default), run `pnpm hosted:check`, commit, and roll
    out. Never set any `*_EMULATOR_HOST`.
17. Confirm the rollout built with pnpm/Node 24 (**verify**) and the first
    request does not fail closed (`PALDORA_ENV` hosted checks).

## 5. Smoke tests (checklist E, G, I, J)

18. Provision a disposable account administratively. Sign in; create a Box,
    post, upload and read a photo, check a notification; confirm a non-member
    gets not-found; confirm exactly one `Content-Security-Policy` header; confirm
    direct Firestore/Storage client access is denied; confirm the session cookie
    is `HttpOnly`, `Secure`, 7 days.

## 6. First staff admin: break-glass (checklist N, ADR 020)

19. **OWNER ACTION, owner-run only, never CI.** Prepare Application Default
    Credentials: `gcloud auth application-default login` (a user credential,
    not a key file; the script refuses any service-account key and any
    credentials path inside this repo).
20. Create the alarm first: a log-based metric on entries of log
    `paldora-staff-audit` with `jsonPayload.event="staff.grant.break_glass"`,
    plus an alert policy (**verify**).
21. **OWNER ACTION.** Run, with the real ids:
    `PALDORA_ENV=staging pnpm firebase:staff:hosted -- --project <STAGING> --confirm-project <STAGING> --operator-label <label> --grant <uid> --role administrator`.
    It checks the target is an existing active account, requires a typed
    phrase, logs the alarm entry (it refuses to grant if that write fails), then
    writes the audit row with `breakGlass: true`. Confirm the alert fired and
    keep the Cloud Audit Log entry as the identity record. Not tested against a
    hosted project.

## 7. Rollback (deployment.md "Rollback per component")

- Web: roll back to the previous App Hosting rollout (**verify** mechanism).
- Functions: redeploy the previous source.
- Rules: redeploy previous rules; the safe fallback is the committed deny-all.
- Indexes: leave additive indexes.
- Staff grant: revoke through the emulator-only command is not available
  hosted; until `staff-grants` exists, revoke by an owner-reviewed script
  change to `NativeModeration.revokeStaff` (open gate; do not edit data by
  hand).

## Abort list: stop and ask the owner if

- `pnpm hosted:check` fails, or any value looks like `demo-`, `dev_only`,
  localhost or an emulator host.
- The budget and alerts are not in place before billing.
- The region cannot be `europe-west4` for any service.
- A deploy would use `firebase.native.json`, or a command lacks an explicit
  `--project <STAGING>`.
- Any key file, token or the Web API key would be written into the repo.
- The App Hosting build cannot use `apps/web` as root, or Node 24 is refused.
- `pnpm functions:bundle:test` fails, or Cloud Build cannot install `sharp`.
- Any smoke test shows a CSP duplicate, public bucket, or client data access.
