# ADR 003: Model Box membership explicitly

Status: accepted for future implementation

Boxes and users have a many-to-many relationship represented by membership records with role, status, and lifecycle timestamps. Authorization reads membership server-side and never trusts a client claim. Blocking and suspended/left membership override content visibility. Database constraints will enforce one active relationship per Box and user.
