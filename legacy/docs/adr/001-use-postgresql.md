# ADR 001: Use PostgreSQL as the source of truth

Status: accepted

PostgreSQL provides transactions, relational constraints, indexing, JSON payload support, and an established path to replicas and partitioning. Redis remains non-canonical. Drizzle supplies explicit TypeScript schema and reviewed SQL migrations without tying the product to a managed vendor abstraction.
