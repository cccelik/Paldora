# ADR 002: Use a NestJS modular monolith

Status: accepted

NestJS supplies module boundaries, dependency injection, lifecycle management, and transport conventions. A modular monolith keeps operations simple while preserving seams that can later become services when evidence warrants it. Controllers orchestrate transport only; domain services and repositories own rules and persistence.
