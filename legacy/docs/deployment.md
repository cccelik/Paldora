# Deployment

The web, API, and worker are independently deployable artifacts from one repository. The mobile application ships through Expo/EAS and app stores. Deployments progress through development, staging, and production with isolated PostgreSQL, Redis, storage, and secrets.

Release order is: back up/verify database, apply backward-compatible migrations, deploy API and worker, deploy web, then retire old schema only after all readers have moved. Destructive migrations require a multi-release expand-and-contract plan.

The platform must terminate TLS, enforce HTTPS, inject secrets, restrict infrastructure networking, aggregate structured logs, collect error/latency/job metrics, and alert on readiness failures. API replicas require a connection-pool budget. Worker concurrency must be tuned per job class.

Required external credentials once deployed are PostgreSQL and Redis URLs, S3-compatible private-storage credentials, and later provider credentials for authentication, error tracking, email, push, and billing. None are required to build or run unit tests.

Phase 1 also requires a dedicated Supabase project, a private S3-compatible
bucket, a storage endpoint that accepts browser requests, and
`NEXT_PUBLIC_MEDIA_ORIGIN` for CSP. Apply database migrations before starting
the new API. Provision demo accounts only from a trusted administration
environment; `SUPABASE_SERVICE_ROLE_KEY` must never be present in the web
deployment.

Rotate Supabase service-role and object-storage credentials through the deployment secret manager. Re-run the idempotent demo seed after rotation only when account details need reconciliation.

## Temporary hosted test environment

The checked-in `render.yaml` supports a short-lived tester environment with:

- Vercel Hobby for the Next.js web application.
- One Render Free web service running the Nest API and BullMQ worker. Render Free
  does not support background-worker services, so
  `scripts/start-deployed-services.mjs` supervises both processes in one
  container after applying migrations.
- Render Free PostgreSQL and Key Value for application data and queues.
- The existing Supabase project for authentication and its S3-compatible Storage
  API for private media.

This topology is for demonstrations, not production. Render Free web services
sleep after inactivity, Free PostgreSQL expires after 30 days, Free Key Value is
not persistent, and no free PostgreSQL backups are provided.

### 1. Prepare Supabase Storage

In the existing Supabase project:

1. Create a private bucket named `paldora-private`.
2. Open **Storage > S3 Connection** and generate server-side S3 access keys.
3. Record the direct S3 endpoint, project region, access-key ID, and secret.
4. During the hosted smoke test, verify a browser can `PUT`, `GET`, and `HEAD`
   through signed URLs. Supabase's managed S3 compatibility does not expose the
   S3 bucket-CORS API, so there is no bucket CORS rule to maintain in the
   dashboard.

S3 keys bypass Storage RLS and belong only in Render. Never add them to Vercel,
client code, or a committed environment file.

### 2. Deploy API infrastructure on Render

Create a Render Blueprint from this GitHub repository and select the root
`render.yaml`. During the first sync, Render prompts for every `sync: false`
value:

| Variable               | Value                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------- |
| `WEB_ORIGIN`           | Planned stable Vercel production origin, for example `https://paldora-web.vercel.app` |
| `SUPABASE_URL`         | Existing Supabase project URL                                                         |
| `S3_ENDPOINT`          | Direct Supabase S3 endpoint ending in `/storage/v1/s3`                                |
| `S3_REGION`            | Region shown by Supabase Storage                                                      |
| `S3_BUCKET`            | `paldora-private`                                                                     |
| `S3_ACCESS_KEY_ID`     | Generated Supabase S3 access-key ID                                                   |
| `S3_SECRET_ACCESS_KEY` | Generated Supabase S3 secret                                                          |

The Blueprint creates `paldora-api`, `paldora-postgres`, and `paldora-redis` in
Frankfurt. The API applies idempotent Drizzle migrations before every start.
Do not add `SUPABASE_SERVICE_ROLE_KEY` or demo passwords to Render.

After the first healthy deploy, copy the API origin, for example
`https://paldora-api.onrender.com`.

### 3. Deploy the web application on Vercel

Import the same GitHub repository as a Vercel project and set its Root Directory
to `apps/web`. Keep the detected Next.js build settings and add these variables
for Production:

| Variable                        | Value                                          |
| ------------------------------- | ---------------------------------------------- |
| `NEXT_PUBLIC_API_URL`           | Render API origin plus `/api/v1`               |
| `NEXT_PUBLIC_WEB_URL`           | Stable Vercel production origin                |
| `NEXT_PUBLIC_MEDIA_ORIGIN`      | Origin of the direct Supabase Storage hostname |
| `NEXT_PUBLIC_SUPABASE_URL`      | Existing Supabase project URL                  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Existing public anonymous key                  |

Only these five public values belong in Vercel. Deploy once, then update
`WEB_ORIGIN` on Render if the assigned Vercel domain differs from the planned
one and redeploy the API.

### 4. Configure authentication URLs

In **Supabase > Authentication > URL Configuration**:

1. Set Site URL to the stable Vercel production origin.
2. Add `<vercel-origin>/auth/callback` to Redirect URLs.
3. Keep the localhost callback while local development is still needed.
4. Confirm the Recovery email template uses the hosted callback and `token_hash`
   flow already documented for local testing.

Do not add wildcard preview URLs for a shared tester environment. Use the stable
production deployment so password-recovery links and CORS have one exact origin.

### 5. Provision the hosted application database

The newly created Supabase identities are not automatically present in Render
PostgreSQL. From a trusted local terminal, temporarily provide Render's external
PostgreSQL connection string as `DATABASE_URL` and run the idempotent seed using
the existing uncommitted Supabase administration values:

Because the Blueprint blocks public database access by default, first add only
your current public IP to the database's inbound rules in Render. Remove that
rule immediately after provisioning.

```bash
DATABASE_URL='postgresql://...' pnpm db:migrate
DATABASE_URL='postgresql://...' pnpm seed:demo
```

Never paste the external database URL into chat, source control, Vercel, or the
browser. Remove it from shell history if the shell records inline assignments.

### 6. Hosted release smoke test

Verify both accounts independently:

1. Sign in and refresh the browser to confirm cookie persistence.
2. Complete a password-recovery link from a newly requested email.
3. Create a Box, invite the other account, and accept it.
4. Publish text and image posts; confirm realtime Home and Box updates.
5. Add comments, emoji reactions, and a camera reaction.
6. Publish a multi-Box Life Update and open Memories.
7. Change Room privacy and confirm friend/member/hidden access with the other
   account.
8. Replace an avatar and Room banner; confirm processed variants appear.
9. Sign out and confirm protected routes return to `/sign-in`.

Finally, run the hosted Playwright suite with the Vercel origin and the two
tester credentials supplied only through the local environment.

### Teardown

When testing ends, delete the Render Blueprint resources and Vercel project,
remove their origins from Supabase Auth, delete the Supabase S3 access keys, and
remove tester identities if they are no longer needed.
