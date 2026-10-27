# ADR-002: LangGraph ReAct Tool-Calling Loop

- **Status**: Accepted
- **Date**: 2026-06-20
- **Context**:
  A fixed linear chain (`select_tables` -> `generate_sql` -> `execute`) fails whenever an entity spelling is ambiguous or a generated join alias triggers a PostgreSQL error, leaving the model unable to recover.
- **Decision**:
  Orchestrate the agent as a cyclical `LangGraph` `StateGraph(AgentState)` ReAct loop (`node_agent_loop` <-> `node_execute_tools` -> `node_clean_and_finalize`) bound to native `ChatOllama` tool calling:
  - The model inspects schemas and values iteratively and validates SQL via `mcp_dry_run_query`.
  - PostgreSQL errors (`diag.message_primary` and `diag.message_hint`) are fed back in `ToolMessage` for in-loop self-healing.
  - A loop guard (`iteration_count >= 30`) routes to `node_force_loop_break`, and N1/N2 fallbacks recover the last dry-run validated query if final formatting fails.
- **Consequences**:
  - *Positive*: Autonomous syntax/join error recovery and accurate entity resolution across arbitrary schemas.
  - *Trade-offs*: Multi-turn tool calls add latency on cache misses and require an explicit iteration cap.
