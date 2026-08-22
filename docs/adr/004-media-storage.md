# ADR 004: Abstract private S3-compatible media storage

Status: accepted

PostgreSQL stores metadata, never image binaries. `@paldora/storage` defines signed upload/download and deletion behavior while a later adapter selects R2, S3, or another compatible provider. Buckets remain private, normal feeds use processed variants, and expensive processing runs in BullMQ workers.
