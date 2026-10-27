# ADR-005: Python SQL DDL Parser for Mermaid Diagrams

- **Status**: Accepted
- **Date**: 2026-06-15
- **Context**:
  Generating Entity-Relationship diagrams in the SQL Sandbox via an LLM call took 5–10 seconds and frequently produced invalid Mermaid syntax that broke client rendering.
- **Decision**:
  Replace LLM diagram generation with a deterministic Python DDL parser (`sql_ddl_to_mermaid` in `backend/app/routers/sandbox.py`) using SQLGlot comment stripping and structured `CREATE TABLE` / `PRIMARY KEY` / `FOREIGN KEY` extraction.
- **Consequences**:
  - *Positive*: Sub-millisecond diagram rendering (`< 1ms`), valid Mermaid `erDiagram` output, and zero GPU usage.
  - *Trade-offs*: Covers standard PostgreSQL `CREATE TABLE`, `PK`, and `FK` constructs rather than arbitrary procedural DDL extensions.
