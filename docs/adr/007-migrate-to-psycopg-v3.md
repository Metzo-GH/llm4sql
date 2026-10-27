# ADR-007: Migrate to Psycopg v3 Connection Pool

- **Status**: Accepted
- **Date**: 2026-08-22
- **Context**:
  `psycopg2-binary` lacked a built-in modern `ConnectionPool`, required legacy cursor wrappers for dictionary rows, and exposed less structured error diagnostics for agent self-healing.
- **Decision**:
  Migrate database connectivity to `psycopg` v3.3+ and `psycopg-pool` (`backend/app/database/pool.py`):
  - Shared thread-safe `ConnectionPool(min_size=2, max_size=10)`.
  - Native `row_factory=dict_row` cursors.
  - Structured `psycopg.Error.diag` (`message_primary`, `message_detail`, `message_hint`) surfaced in `mcp_dry_run_query`.
  - Safe schema switching via `psycopg.sql.Identifier` and clean `rollback()` -> `read_only = False` teardown before returning connections to the pool.
- **Consequences**:
  - *Positive*: Thread-safe connection pooling on Python 3.12+ and actionable PostgreSQL hints for self-healing.
  - *Trade-offs*: Array filter syntax uses `= ANY(%s)` rather than `psycopg2` tuple `IN %s` adaptation.
