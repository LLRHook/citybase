---
description: "citybase-tailored orchestrate run (planner → executor → validator → reviewer) with repo-specific preflight, profile rules, and validation matrix. Usage: /citybase-orchestrate [goal] [--profile lite|balanced|full|plan-only]"
prevent_model_invocation: true
---

# /citybase-orchestrate

Routes a structured orchestration through the project's specific rules. Loads two skills in order:

1. **Base `orchestrate`** — owns the planner / executor / validator / reviewer stage contracts, profile semantics, and stage output shapes.
2. **`.claude/skills/citybase-orchestrate/SKILL.md`** — adds citybase-specific preflight, profile routing, recon checklist, validation matrix, review checklist, PR workflow, and the encoded list of traps the generic planner has missed before.

When the two conflict, **repo-specific rules win**. The planner's profile justification must reference both skills by name.

## Mandatory repo gates (echoed from the generated skill — see SKILL.md for full detail)

**Preflight (run before any stage):**

```bash
npm ci
npm run lint        # MUST be 0 errors
npm run build
npm test -- --run
git config --get core.hooksPath   # must print: hooks
```

**Force `full` profile when the change touches any of:**

- `hooks/commit-msg` or `.claude/hooks/validate-commit-msg.sh`
- `.github/workflows/ci.yml`
- `src/data/seed.js` field shapes (renames cascade; backend replaces this file in Phase 1)
- `docs/agent-runtime.md` `AgentProvider` interface
- new `package.json` `dependencies` or `devDependencies`

**Validation matrix:** `npm run lint` + `npm run build` + `npm test -- --run` for every change. UI-visible changes also require a manual `npm run dev` browser check (no e2e harness yet).

**Never without explicit approval:**

- TypeScript migration (deferred per ROADMAP)
- Tailwind / styling overhauls
- Storybook
- Zustand store
- Backend code (Hono, Postgres, OAuth)
- New runtime dependencies
- Re-enabling CodeRabbit's docstring check

**Commit subjects:** `<type>(<scope>)?<!>?: <description>` — max 72 chars, lowercase first description char, no trailing `.!?`. Allowed types: `feat fix refactor docs test chore ci style perf build revert`. The hook in `hooks/commit-msg` rejects non-conformant subjects. **Do NOT invoke the global `/commit` skill in this repo** — its branch-name subject format is incompatible.

**PR workflow:** every PR squash-merges with a fresh conventional-commit subject. CI is the merge gate; CodeRabbit is advisory.

## Routing

When `/citybase-orchestrate` is invoked, the planner reads the generated SKILL.md, runs preflight, picks the profile per the rules above, and then defers stage execution to the base orchestrate skill. The trap list in SKILL.md must be checked before the planner finalizes its plan — those are not theoretical, they tripped the generic planner in Phase 0A.
