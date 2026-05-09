<!-- Thanks for the PR. Fill in each section. Delete sections that don't apply. -->

## What this PR does

<!-- One or two sentences describing the change in plain language. -->

## Why

<!-- The reason for the change. Link to a roadmap phase, ticket, or discussion. -->

## How to test

<!-- Steps a reviewer can follow to verify the change locally. -->

```bash
npm install
npm run lint
npm run build
npm test -- --run
npm run dev   # if the change is visible
```

## Checklist

- [ ] `npm run lint` passes
- [ ] `npm run build` passes
- [ ] `npm test -- --run` passes
- [ ] No new runtime dependencies (or: justified in "Why" section)
- [ ] No TypeScript migration of unrelated files
- [ ] No design / styling overhauls outside the change's scope
- [ ] If mock data was added or changed, it lives in `src/data/seed.js`
- [ ] Documentation updated if behavior changed (`README.md`, `AGENTS.md`, `docs/`)

## Risk / rollback

<!-- What could break? How to revert if needed? -->
