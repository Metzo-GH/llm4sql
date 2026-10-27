# Changelog

All notable changes to this project are documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-10-27

### Added
- **LangGraph ReAct Agent**: Tool-calling `StateGraph(AgentState)` pipeline compatible with any tool-capable local Ollama model, including PostgreSQL `EXPLAIN` self-healing and N1/N2 fallbacks.
- **Read-Only FastMCP Server**: 5 PostgreSQL introspection tools (`list_tables`, `get_schema`, `search_value`, `get_sample_data`, `dry_run_query`) plus validated `execute_query`.
- **SQL Evaluation Benchmark**: 18 reference SQL test cases measuring Execution Accuracy with per-step latency telemetry, dataset CRUD routes, and live cancellation.
- **Token-Based Result Comparator**: Tolerant result-set comparison handling column aliases, numeric rounding, `COALESCE`/`NULL` equivalence, and concatenated string values.
- **SSE Token & Context Streaming**: Real-time `<think>` token streaming, MCP tool timing logs, and Ollama context window usage gauge via unbuffered Nginx reverse proxy.
- **Isolated SQL Sandbox**: `user_sandbox` schema for custom `CREATE TABLE` and `INSERT INTO` workloads with deterministic Python SQLGlot DDL-to-Mermaid ERD generation (`< 1ms`).
- **React 19 Web Client**: Interactive chat, schema explorer, `@tanstack/react-virtual` data table, CSV export, and Recharts bar/pie views.
- **Unified Docker & Host Ollama Launchers**: Multi-stage Docker Compose stack with cross-platform launchers (`start.ps1`, `start.bat`, `start.sh`, `backend/start_backend.ps1`) verifying `0.0.0.0:11434` socket binding, `q4_0` KV cache / Flash Attention runtime flags, Windows `ollama app.exe` desktop priority, and container-to-host `/api/ollama/models` reachability.
- **Architecture Diagrams & Documentation**: Code-verified SVG diagrams (`system_container_architecture.svg`, `langgraph_agent_execution_flow.svg`, `frontend_client_architecture.svg`), `ARCHITECTURE.md`, component `README.md` guides, and ADRs (`001`–`007`).
- **MIT License**: Open-source MIT license file.

### Changed
- **PostgreSQL Driver**: Migrated from `psycopg2-binary` to `psycopg` v3 and `psycopg-pool` (`ConnectionPool`, `dict_row`, structured PostgreSQL error diagnostics) (ADR-007).
- **Zero-Shot Schema Discovery**: Removed static few-shot template RAG in favor of live MCP schema/value inspection to avoid attention collapse on compact local models (ADR-004).
- **Modular Codebase**: Split monolithic agent, benchmark, and React chat modules into focused single-responsibility files (`services/agent/`, `services/eval/`, `hooks/`).
- **Ollama HTTP Timeouts**: Added configurable `OLLAMA_TIMEOUT` (`90.0s` default) and shared `httpx` connection pools.

### Fixed
- **Pooled Connection Cleanup (`psycopg` v3)**: Reordered `get_db_conn` teardown in `app/database/pool.py` to call `conn.rollback()` before resetting `conn.read_only = False`, preventing `INTRANS` rollback warnings when returning connections to `ConnectionPool`.
- **Default Local `.env` Alignment**: Aligned `.env.example` local PostgreSQL defaults (`llm4sql_user` / `llm4sql_password`) with `docker-compose.yml` so fresh `cp .env.example .env` setups connect out of the box.

### Security
- **SQLGlot AST Enforcement**: Strict read-only `SELECT` validation blocking `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, multi-statement chaining, and dangerous PostgreSQL system functions (`pg_sleep`, `pg_read_file`).
- **Session-Level Read-Only Transactions**: Analytical queries execute with `conn.read_only = True` on `psycopg` v3 connections and restricted `search_path`.
- **Schema-Partitioned Semantic Cache**: Cache entries are isolated by `(model, target_schema)` (`public` vs `user_sandbox`) to prevent cross-schema leakage (ADR-006).
- **XSS Sanitization**: Sanitized rendered Markdown and dynamic Mermaid SVGs with `DOMPurify`.
