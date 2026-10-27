# ADR-001: Read-Only Python MCP Server

- **Status**: Accepted
- **Date**: 2026-05-28
- **Context**:
  The LLM agent needs to inspect relational schemas, foreign keys, sample rows, and query execution plans. Giving the model unrestricted SQL client access risks accidental destructive statements (`DROP`, `DELETE`, `UPDATE`) or unbounded data dumps.
- **Decision**:
  Expose PostgreSQL introspection exclusively through a read-only Python `FastMCP` server (`backend/app/mcp/mcp_server.py`) with 5 scoped tools:
  1. `mcp_list_tables`: Lists base tables in the active schema (`public` or `user_sandbox`).
  2. `mcp_get_schema`: Returns columns, types, nullability, and FK `LEFT JOIN` / `INNER JOIN` hints.
  3. `mcp_search_value`: Runs `ILIKE` lookups across text columns to resolve entity spellings.
  4. `mcp_get_sample_data`: Fetches up to 10 sample rows per table.
  5. `mcp_dry_run_query`: Validates candidate `SELECT` queries via SQLGlot, `EXPLAIN`, and `SELECT ... LIMIT 0` inside a `READ ONLY` transaction.
- **Consequences**:
  - *Positive*: Enforces strict read-only boundaries and standardized tool schemas for any tool-calling model.
  - *Trade-offs*: Requires explicit JSON serialization for PostgreSQL `Decimal` and date/time types.
