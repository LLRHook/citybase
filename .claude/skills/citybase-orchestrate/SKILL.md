---
name: citybase-orchestrate
description: Use when orchestrating implementation, refactor, fix, validation, or review work in citybase — a React 19 + Vite 8 + Vitest 4 design-prototype repo with a conventional-commit hook, advisory CodeRabbit review, and Phase 0A foundation already merged. JS/JSX only (TypeScript deferred). Triggers when the user runs /orchestrate, /citybase-orchestrate, /fix, /test, or any planner→executor→validator→reviewer flow inside this repo.
---

Use this skill alongside the base **`orchestrate`** skill. The base skill owns the planner / executor / validator / reviewer stage contracts, profile semantics, and stage output shapes; this file only adds citybase-specific context. When the two conflict, repo-specific rules here win. The future planner must echo "base orchestrate" by name when it justifies a profile choice.

## Repo summary

- **Stack**: React 19.2.6, react-dom 19.2.6, Vite 8.0.11, Vitest 4.1.5, jsdom 29.1.1, @testing-library/react 16, @testing-library/jest-dom 6, ESLint 10.3.0 (with `eslint-plugin-react-hooks` 7 + `eslint-plugin-react-refresh` 0.5), `globals` 17.
- **Layout**: single-app (no backend/frontend split). `src/App.jsx` is the top shell; `src/data/seed.js` is the canonical mock data source; `src/game/*` are the UI components, color/hex/hook helpers; `src/tests/*.smoke.test.jsx` are RTL smoke tests; `hooks/commit-msg` enforces conventional commits; `.github/workflows/ci.yml` runs the gate.
- **Default branch**: `main`. PRs squash-merge with conventional-commit subjects (under 72 chars, lowercase first word in description, no trailing `.!?`).
- **Status**: Phase 0A (foundation stabilization) complete; Phase 1+ (Bitbucket adapter, agent runtime, sandbox, real PRs) not started. See [ROADMAP.md](../../../ROADMAP.md).
- **Detected docs to consult per task** — read by exact filename:
  - `README.md` — quick start, scripts, project structure
  - `AGENTS.md` — provider-neutral handbook (rules, where state/data live, commit hook)
  - `CLAUDE.md` — Claude-specific notes (gh path, squash-merge convention, what not to introduce)
  - `CONTRIBUTING.md` — PR workflow, commit format the hook enforces
  - `ROADMAP.md` — phased plan; Phase 0A complete with PR links
  - `docs/domain-model.md` — 7 entities (repo, district, building, quest, saga, guild, adventurer, agent run)
  - `docs/agent-runtime.md` — provider-neutral `AgentProvider` interface

## Preflight

Run before any orchestration step:

```bash
npm ci                    # also runs postinstall → git config core.hooksPath hooks
npm run lint              # MUST be 0 errors / 0 warnings (rule is at error severity)
npm run build             # Vite build to dist/
npm test -- --run         # Vitest one-shot, 4 smoke tests should pass
git config --get core.hooksPath   # must print: hooks
```

If `npm run lint` is not zero-error on the **starting** state, that's a baseline failure — fix it before assuming any planned change broke something. The generic orchestrate planner missed this in Phase 0A and proposed work that wouldn't merge.

## Profile selection rules

Profile semantics come from the base **`orchestrate`** skill. These rules only add citybase routing:

- **lite** — single-file copy edits, README/docs typos, single-line config tweaks. Skip planner stage; execute directly.
- **balanced** — typical code change touching 1–4 files in `src/game/`, `src/data/`, or `src/tests/`. Single planner pass + execute + validator. Default for most quests.
- **full** — anything touching:
  - `hooks/commit-msg` or `.claude/hooks/validate-commit-msg.sh` (commit gate; a regex bug here breaks the merge process for everyone)
  - `.github/workflows/ci.yml` (CI gate; a YAML syntax error blocks all PRs)
  - `src/data/seed.js` shape changes (the backend replaces this file in Phase 1; field renames cascade)
  - `docs/agent-runtime.md` `AgentProvider` interface (every Phase 4 adapter must conform)
  - any new top-level dependency in `package.json` `dependencies` or `devDependencies`
- **plan-only** — when the user is exploring options and not ready to ship. Always pair with an explicit "no commits" guard.

## Stack-specific reconnaissance checklist

For typical tasks, read these files first before editing:

- **State / view switching** → `src/App.jsx` (single `view` state value: `'city' | 'kanban' | 'analysis'`; all UI state lives here)
- **Mock data** → `src/data/seed.js` (canonical). Never add new mock data to `src/game/data.js` or `src/game/sagas.js` — those are re-export shims for back-compat.
- **Color / theme** → `src/game/palette.js` (NEON tokens, `C(key)`, `alpha(hex, a)`)
- **Hex grid math** → `src/game/hex.js` (`HEX_SIZE`, `hexToPx`, `hexCorners`, `hexPath`)
- **UI primitives** → `src/game/theme.jsx` (Panel, NeonBar, Pill, Mono, Title, NButton, Crest, IsoBuilding) — components only; do NOT add non-component exports here.
- **Views** → `src/game/map.jsx` (city), `src/game/kanban.jsx` (board), `src/game/analysis.jsx` (PR view)
- **Panels & modals** → `src/game/panels.jsx`, `src/game/command.jsx`, `src/game/modals.jsx`
- **Hooks** → `src/game/useTweaks.js` (separate from `tweaks.jsx` to satisfy Fast Refresh)
- **Tests** → `src/tests/setup.js` (jest-dom + matchMedia shim) + `src/tests/*.smoke.test.jsx`
- **Lint config** → `eslint.config.js` (flat config; Vitest globals declared for `src/tests/**`)
- **Vite config** → `vite.config.js` (Vitest section: `environment: 'jsdom'`, `globals: true`, setupFiles)

## Implementation boundaries

Do not change without explicit user approval:

- **`src/data/seed.js` field shapes** — backend replaces this file; renames break every consumer. Adding new fields is fine.
- **`docs/agent-runtime.md` `AgentProvider` interface** — every future adapter (Claude, Codex, Gemini, local) implements it. Adding methods is breaking.
- **`hooks/commit-msg` regex** — was bug-prone once already (filenames-with-dots issue). Test against a battery of cases (no type, uppercase, trailing punctuation, over-length, valid plain, valid scoped, valid breaking, filename-in-subject) before changing.
- **`.github/workflows/ci.yml`** — SHA-pinned actions are intentional; never replace with `@v6` tags. `permissions: contents: read` is least-privilege; never widen without justification. Push trigger is restricted to `main` (avoid double-runs); never broaden.
- **`.coderabbit.yaml` `pre_merge_checks.docstrings.mode`** — explicitly OFF because the project rule is "default to no comments." Don't re-enable.
- **`package.json` runtime `dependencies`** — only `react` + `react-dom`. New runtime deps require justification per AGENTS.md.

Hard "no" without discussion: TypeScript migration, Tailwind/styling overhauls, Storybook, Zustand store, Prettier config, backend code (Hono, Express, Postgres, OAuth), real Jira/Bitbucket integration. All deferred per ROADMAP Phase 0 → Phase 1+.

## Validation matrix

| Layer | Lint | Build | Test | Notes |
|---|---|---|---|---|
| Top-level | `npm run lint` | `npm run build` | `npm test -- --run` | All three must be 0-error before commit. |
| Tests-only | `npm run lint` (test glob included) | n/a | `npm test -- --run` | Vitest globals (`describe`, `it`, `expect`, `vi`) declared in `eslint.config.js` for `src/tests/**`. |
| CI | n/a | n/a | n/a | `.github/workflows/ci.yml` runs all three on every PR via `pull_request` event. Local parity with CI is exact (Node 20). |

UI-visible changes (anything that alters what a user sees in the city, kanban, or analysis view) require a manual browser check via `npm run dev` (http://localhost:5173). The smoke tests cover render and seed-data flow but not visual regressions. There is no Playwright / Cypress / e2e harness yet.

Vitest gotcha: View-switch button labels in `src/App.jsx:178-201` contain unicode glyphs (`◇ CITY`, `▤ KANBAN`, `◉ ANALYSIS`). RTL queries against these must use regex (`getAllByText(/CITY/)`) — exact `getByText('CITY')` will fail.

## Review checklist

Repo-specific concerns the reviewer stage must verify:

1. **Fast Refresh discipline** — no new non-component export added to a `.jsx` file. Constants and hooks belong in `.js` modules. The `react-refresh/only-export-components` rule is at error severity.
2. **Mock-data location** — new mock data is in `src/data/seed.js`, not in component files or shims.
3. **Inline-style restraint** — match the existing inline-style pattern in `src/game/`. Do not introduce CSS-in-JS, Tailwind, or styled-components.
4. **Commit subject conformance** — every new commit on the branch matches `<type>(<scope>)?<!>?: <imperative description>` (max 72 chars; description starts lowercase; no trailing `.!?`). The hook will reject otherwise, but a planned series of commits should be conformant from the start.
5. **No comments by default** — the project rule is to default to writing no comments. Reject auto-generated docstrings (CodeRabbit's "Generate docstrings" finishing-touch checkbox writes commits that violate this — never click it). Keep WHY comments when non-obvious; remove WHAT/narration.
6. **No silent CodeRabbit dismissal** — if CodeRabbit's review verdict is dismissed, the dismissal message must reference the commit SHAs that addressed each finding (or a brief reason for skipping).
7. **CI parity** — every check that runs in CI must run locally before push. If `npm run lint` is green locally and red in CI, the lint config or Node version differs (it shouldn't; both are Node 20).

## Local-dev workflow

```bash
npm run dev        # Vite dev server with HMR at http://localhost:5173
npm test           # Vitest watch mode (Ctrl-C to exit)
```

There is no Docker, docker-compose, Makefile, or Justfile. The dev loop is just `npm run dev`. Teardown: stop the dev server (Ctrl-C); no other cleanup needed.

## PR workflow

This repo uses `gh` (GitHub CLI) for all PR operations. On Windows the binary is at `/c/Program Files/GitHub CLI/gh.exe` until Claude Code is restarted to pick up PATH; bare `gh` works after restart and is auto-allowed for read-only subcommands.

```bash
# Open PR
gh pr create --base main --head <branch> --title "<conventional subject>" --body "<body>"

# Watch CI + CodeRabbit (StatusContext "CodeRabbit" goes from PENDING → SUCCESS)
gh pr view <N> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup

# Re-trigger CodeRabbit after fixes
gh pr comment <N> --body "@coderabbitai review"

# Squash-merge with a fresh subject
gh pr merge <N> --squash --subject "<type>(<scope>)?: <description>" --body "<body>"
```

When CodeRabbit's previous `CHANGES_REQUESTED` review is sticky after fixes, dismiss it explicitly:

```bash
gh api -X PUT repos/<owner>/<repo>/pulls/<N>/reviews/<review-id>/dismissals \
  -f message="Addressed in commits <sha1>, <sha2>; CodeRabbit re-review status SUCCESS."
```

## Known traps (encoded from prior orchestrations)

These caught the generic planner in Phase 0A; the local skill must check them up front:

1. **Lint baseline check.** Run `npm run lint` on the *starting* state of the branch before assuming any change introduced an error. The generic planner assumed package.json scripts == green CI; it didn't.
2. **Unicode-glyph button labels.** RTL queries in tests against view-switch buttons need regex matchers, not exact strings.
3. **Fast Refresh ban on mixed exports.** `eslint-plugin-react-refresh` v0.5 + `react-refresh/only-export-components` at error severity rejects any `.jsx` file that exports both components and non-components. Co-locating constants with components in `.jsx` is a ban; either privatize the constant or move to a `.js` sibling.
4. **Commit-msg regex must allow intermediate dots.** Filenames with `.` (CLAUDE.md, .coderabbit.yaml) are common in subjects. The pattern `[^.!?]*[^.!?]$` excludes ALL dots — wrong. Use `.*[^.!?]$` (only restrict trailing char).
5. **Dependabot follow-on PRs.** After merging a PR that pins or bumps any `actions/*` SHA in workflow files, expect 1–2 Dependabot PRs to appear within hours. Triage with `gh pr list --author app/dependabot`. Squash-merge with a `build(deps)` or `build(actions)` subject.
6. **CodeRabbit "Generate docstrings".** Don't click the checkbox — it commits non-conformant subjects (`📝 Add docstrings to ...`) and adds JSDoc that violates the no-comments rule. The `.coderabbit.yaml` already disables the docstring pre-merge check; don't re-enable.
7. **Global `/commit` skill is incompatible.** The user's global commit skill writes the literal branch name as the subject. The hook rejects that format. Use `git commit -m "<type>: ..."` directly.
8. **Settings watcher caveat.** `.claude/settings.json` and `.claude/hooks/*` only fire in sessions that started after `.claude/` existed. Existing sessions don't pick them up; tell the user to restart Claude Code if they need the hooks live in this turn.

## Final report expectations

Every orchestration in this repo ends with:

- **Files changed** — full paths, grouped by commit if multiple
- **Commands run** — the exact `npm run lint`, `npm run build`, `npm test -- --run`, `gh pr ...` lines
- **CI + CodeRabbit verdicts** — both must be SUCCESS before merge; if dismissed, the dismissal reason
- **Merge SHA** — the squash-merge commit SHA on `main`
- **Residual risks** — any deferred items, follow-up PRs needed (e.g. Dependabot follow-ons), known caveats
- **Next-phase pointer** — link to the relevant ROADMAP section if the work unblocks a downstream phase
