# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-25

### Added

- Phase 0 bootstrap: Next.js 16 (App Router, TypeScript) app scaffold and Supabase project layout (`supabase init`).
- Agent team framework: `ORCHESTRATOR.md`, `rules/`, `roles/`, `templates/`, `scripts/verify.sh`, `scripts/bootstrap-check.sh`.
- Pinned tool versions (Node 24.11.0, npm 11.6.1, Supabase CLI 3.2.0) and npm scripts `typecheck`, `lint`, `test`, `build`.
- CI (`verify`, `db-check`, `secrets`) and the nightly read-only drift check workflow.
- First migration (`init`, no schema changes) and a first pgTAP test.
- `.gitattributes` (LF), `.gitignore`, PR template.

[Unreleased]: https://github.com/masterege96/AutomationTest/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/masterege96/AutomationTest/releases/tag/v0.1.0
