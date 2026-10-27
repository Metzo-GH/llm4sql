# ADR-003: Execution Accuracy over AST Heuristics

- **Status**: Accepted (Supersedes AST Heuristics Exploration)
- **Date**: 2026-07-15
- **Context**:
  Early evaluation experiments translated SQLGlot ASTs back into heuristic prose and compared string similarity against the user's question. Valid SQL queries scored poorly (0%–35%) whenever SQL phrasing differed from natural language wording.
- **Decision**:
  Drop AST-to-prose similarity scoring and evaluate Text-to-SQL exclusively via **Execution Accuracy** against PostgreSQL ground-truth queries (`backend/app/services/eval/`), paired with a tolerant result comparator supporting column alias differences, numeric rounding, `COALESCE`/`NULL` equivalence, and token-level matching for concatenated strings.
- **Consequences**:
  - *Positive*: Eliminates false negatives from valid alternative SQL formulations (benchmark accuracy measured directly on result sets: 18/18 on reference suite).
  - *Trade-offs*: Requires curated ground-truth SQL queries and a seeded reference dataset.
