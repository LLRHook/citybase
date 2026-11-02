# Contributing to Citybase

Read [AGENTS.md](AGENTS.md) and the [documentation index](docs/README.md).
Godot is the primary frontend; Electron is a legacy fallback. Changes should
preserve shared service behavior and the provider-neutral harness.

## Workflow

1. Branch from current `main`. Preserve other writers' changes and use an
   isolated checkout for concurrent work.
2. Scope/file the ticket with the maintained tracker writer before coding.
   Use groom, implement or a cohesive implement-batch, doc-sync, then V&V.
3. Make focused conventional commits. Open a PR with problem, behavior,
   validation at the tested SHA, risks and actual limitations.
4. Fix failing CI and substantive review findings. CI gates merge; CodeRabbit
   advice does not itself block it. Use the repository's squash-merge convention.

Never push directly to `main`, skip hooks/checks, override Git identity, or
rewrite someone else's history. The global `/commit` skill is not appropriate
for this project's subject convention.

## Local gate

```sh
npm ci
python .cycle/trackers.py install
npm run lint
npm run build
npm test
npm run test:coverage
npm run test:e2e
npm run test:godot
python .cycle/trackers.py lint
node scripts/check-doc-links.mjs
```

Node and jsdom test projects have distinct environments; production fixtures
are prohibited. Tests live in `src/tests/`, Electron smoke in `e2e/`, GDScript
regressions in `godot/tests/`. Use real-system boundary tests for persistence,
processes and transport. Label deterministic provider fixtures honestly.

CI uses the supported `.nvmrc` runtime, coverage/static checks, Linux desktop
smoke/packaging, Windows/macOS smoke, and checksum-pinned Godot headless checks.
The full manual/native release procedure remains [VERIFICATION.md](VERIFICATION.md).

## Commits and style

Subject: `<type>(<scope>)?: <description>`, at most 72 characters. Use a lowercase
imperative description without final `.`, `!` or `?`. Types: feat, fix, refactor,
docs, test, chore, ci, style, perf, build, revert. Optional `!` marks breaking
changes. `hooks/commit-msg` is authoritative, including its Git-generated merge,
revert and fixup exemptions.

Match the owning module. Keep JavaScript/JSX and CJS conventions; do not migrate
TypeScript incidentally. Preserve the Electron isolation/bridge boundary and
keep production subprocesses in the process service. Frontend changes do not
authorize a styling-system swap, new backend, cloud infrastructure or unreviewed
runtime dependency. React is a development dependency bundled by Vite; `ws` is
the core's runtime dependency.

## Documentation and release

Update living docs caused by the change and file other drift as a docs defect.
Preserve dated evidence. Record meaningful test counts/skips and platform limits;
never equate CI, source checks, provider output quality and a full release gate.
The owner decides milestone/version and publication after the concrete release
candidate and required native validation are ready.
