# ADR-006: Schema-Partitioned Semantic Cache

- **Status**: Accepted
- **Date**: 2026-08-20
- **Context**:
  `SemanticCache` accelerates repeated or semantically equivalent questions (`>= 0.90` cosine similarity via Ollama `/api/embed` with Jaccard fallback). Supporting both `public` and `user_sandbox` introduced a cross-schema collision risk if identical questions hit cached SQL written for a different schema.
- **Decision**:
  Partition all `SemanticCache` keys and similarity lookups strictly by `(model, target_schema)` (`public` vs `user_sandbox`), and scope cache invalidation to `user_sandbox` on sandbox re-initialization.
- **Consequences**:
  - *Positive*: Prevents cross-schema SQL/result leakage in line with OWASP LLM08 isolation practices.
  - *Trade-offs*: Queries against `user_sandbox` maintain a separate cache namespace from `public`.
