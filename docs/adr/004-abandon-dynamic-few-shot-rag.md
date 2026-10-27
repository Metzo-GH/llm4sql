# ADR-004: Drop Dynamic Few-Shot RAG to Prevent Attention Collapse

- **Status**: Accepted (Supersedes Dynamic Template RAG)
- **Date**: 2026-07-28
- **Context**:
  Injecting synthetic SQL templates (`templates.json`) into the system prompt via keyword matching caused attention collapse on compact local models (4B–8B parameters): imperfect examples anchored the model onto non-existent column names and failed completely on custom `user_sandbox` schemas.
- **Decision**:
  Remove synthetic few-shot template injection and rely purely on zero-shot live schema discovery via MCP tools (`mcp_list_tables`, `mcp_get_schema`, `mcp_search_value`, `mcp_dry_run_query`).
- **Consequences**:
  - *Positive*: Shorter system prompt (~60% reduction), fewer hallucinated identifiers, and schema-agnostic behavior across `public` and `user_sandbox`.
  - *Trade-offs*: Requires at least one MCP tool round-trip on cold queries to inspect table definitions.
