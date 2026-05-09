# Verified commands for citybase

## Daily

```bash
npm run dev                # Vite dev server, http://localhost:5173
npm run lint               # ESLint over the project (0 errors expected)
npm run build              # Vite production build to dist/
npm test -- --run          # Vitest one-shot, 4 smoke tests
npm test                   # Vitest watch mode
```

## Git / hooks

```bash
git config --get core.hooksPath               # must print "hooks"
echo "feat: example" > /tmp/m && bash hooks/commit-msg /tmp/m   # validator smoke test
git -c user.name="Victor Ivanov" -c user.email="vivanov@paradigmtesting.com" commit -m "<conventional subject>"
```

## gh CLI (Windows full path until next Claude Code restart)

```bash
"/c/Program Files/GitHub CLI/gh.exe" auth status
"/c/Program Files/GitHub CLI/gh.exe" pr view <N> --json mergeable,mergeStateStatus,reviewDecision,statusCheckRollup
"/c/Program Files/GitHub CLI/gh.exe" pr checks <N>
"/c/Program Files/GitHub CLI/gh.exe" pr diff <N>
"/c/Program Files/GitHub CLI/gh.exe" pr comment <N> --body "@coderabbitai review"
"/c/Program Files/GitHub CLI/gh.exe" pr merge <N> --squash --subject "<conventional subject>" --body "<body>" --delete-branch=false
"/c/Program Files/GitHub CLI/gh.exe" pr list --author app/dependabot --json number,title,headRefName,mergeable
```

## Resolving an action SHA for ci.yml

```bash
"/c/Program Files/GitHub CLI/gh.exe" api repos/actions/checkout/commits/v6 --jq '.sha'
"/c/Program Files/GitHub CLI/gh.exe" api repos/actions/setup-node/commits/v6 --jq '.sha'
```

## Polling PR state until CI + CodeRabbit settle

```bash
until [ "$("/c/Program Files/GitHub CLI/gh.exe" pr view <N> --repo LLRHook/citybase --json statusCheckRollup --jq '[.statusCheckRollup[] | (.conclusion // .state)] | all(. != "PENDING" and . != null and . != "" and . != "QUEUED" and . != "IN_PROGRESS")')" = "true" ]; do sleep 15; done
```

## Dismissing stale CodeRabbit reviews after fixes

```bash
REVIEW_IDS=$("/c/Program Files/GitHub CLI/gh.exe" api "repos/LLRHook/citybase/pulls/<N>/reviews" --jq '.[] | select(.state=="CHANGES_REQUESTED") | .id')
for id in $REVIEW_IDS; do
  "/c/Program Files/GitHub CLI/gh.exe" api -X PUT "repos/LLRHook/citybase/pulls/<N>/reviews/$id/dismissals" \
    -f message="Addressed in commits <sha1>, <sha2>; CodeRabbit re-review status SUCCESS."
done
```
