# Repository Guidelines

## Agent skills

### Issue tracker

Issues and specs are tracked as local Markdown files in `.scratch/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The repository uses the default canonical triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This repository uses a single-context domain-doc layout. See `docs/agents/domain.md`.

## Project Structure & Module Organization

- `qq-bot-message-probe/` contains the standalone Node.js 20+ QQ Bot WebSocket probe.
  - `src/probe.mjs` is the executable entry point.
  - `package.json` defines runtime dependencies and local scripts.
  - `.env` is local-only configuration; never commit tokens or captured logs.
- `requirements/` is the product-requirements source of truth. `requirements/README.md` indexes the current PRD baselines; each `PRD-*.md` is a versioned specification.

Keep implementation changes inside the relevant component directory. Avoid mixing product-scope changes and probe behavior changes in one commit unless they are directly coupled.

## Build, Test, and Development Commands

Run commands from `qq-bot-message-probe/`:

```bash
npm install       # install the ws dependency
npm run check     # syntax-check src/probe.mjs
npm start         # connect to the configured QQ Bot gateway
```

Before `npm start`, copy the supplied environment template if present and export `QQ_BOT_ACCESS_TOKEN` and `QQ_BOT_GATEWAY`. Use a consented test group only.

## Coding Style & Naming Conventions

Use ES modules and modern Node.js syntax. Follow the existing style: two-space indentation, double quotes, semicolons, trailing commas in multiline literals, and `camelCase` for variables and functions. Name event constants in `UPPER_SNAKE_CASE` (for example, `GROUP_AND_C2C_EVENT`). Keep console output useful for live diagnosis, and do not print credentials.

## Testing Guidelines

There is currently no automated test suite. Run `npm run check` for every code change, then manually validate the probe against a test bot and group when gateway behavior changes. Record only the expected event names and outcome in review notes; do not attach real message content or access tokens.

## Requirements Documentation

Name requirements files as `PRD-<number>-<topic>-v<major>.<minor>.<patch>.md`. When editing a PRD, update its version history and the current-baseline table in `requirements/README.md` when the active version changes.

## Commit & Pull Request Guidelines

This repository has no commit history yet; use concise imperative commit subjects, such as `Add gateway reconnect handling` or `Clarify PRD-002 review flow`. Keep pull requests focused, describe behavior and validation, link the relevant PRD or issue, and include sanitized terminal output or screenshots only when they help reviewers verify a user-visible change.
