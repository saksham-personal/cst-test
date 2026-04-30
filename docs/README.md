# Documentation Index

This folder holds the durable project docs that are useful across build,
backend, UI, and maintenance work.

## Current Docs

- [SCORING.md](/E:/company-screener/docs/SCORING.md)
  Detailed explanation of the historical C scoring model and its formulas.
- [REACT_IMPLEMENTATION_SPEC.md](/E:/company-screener/docs/REACT_IMPLEMENTATION_SPEC.md)
  React UI implementation guidance and component mapping.
- [RECOMMENDATIONS.md](/E:/company-screener/docs/RECOMMENDATIONS.md)
  Earlier audit and improvement notes.
- [RECOMMENDATIONS2.md](/E:/company-screener/docs/RECOMMENDATIONS2.md)
  Expanded audit and recommendations with more detailed findings.
- [REPO_STRUCTURE.md](/E:/company-screener/docs/REPO_STRUCTURE.md)
  Canonical map of the repo, ownership boundaries, and maintenance rules.
- [AGENT_HANDOFF.md](/E:/company-screener/docs/AGENT_HANDOFF.md)
  How to brief another coding agent to make changes safely and consistently.

## Which Docs Are Canonical

- For runtime/backend/search architecture, prefer
  [REPO_STRUCTURE.md](/E:/company-screener/docs/REPO_STRUCTURE.md).
- For UI direction, prefer
  [REACT_IMPLEMENTATION_SPEC.md](/E:/company-screener/docs/REACT_IMPLEMENTATION_SPEC.md).
- For scoring background, prefer
  [SCORING.md](/E:/company-screener/docs/SCORING.md), but note that the
  current runtime uses SQLite FTS5 `bm25(...)` by default.
- For historical audits, use
  [RECOMMENDATIONS.md](/E:/company-screener/docs/RECOMMENDATIONS.md) and
  [RECOMMENDATIONS2.md](/E:/company-screener/docs/RECOMMENDATIONS2.md) as
  reference material rather than as the source of truth for current behavior.
