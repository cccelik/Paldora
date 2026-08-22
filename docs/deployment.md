# Deployment

The web, API, and worker are independently deployable artifacts from one repository. The mobile application ships through Expo/EAS and app stores. Deployments progress through development, staging, and production with isolated PostgreSQL, Redis, storage, and secrets.

Release order is: back up/verify database, apply backward-compatible migrations, deploy API and worker, deploy web, then retire old schema only after all readers have moved. Destructive migrations require a multi-release expand-and-contract plan.

The platform must terminate TLS, enforce HTTPS, inject secrets, restrict infrastructure networking, aggregate structured logs, collect error/latency/job metrics, and alert on readiness failures. API replicas require a connection-pool budget. Worker concurrency must be tuned per job class.

Required external credentials once deployed are PostgreSQL and Redis URLs, S3-compatible private-storage credentials, and later provider credentials for authentication, error tracking, email, push, and billing. None are required to build or run unit tests.
