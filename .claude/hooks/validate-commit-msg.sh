#!/usr/bin/env bash
# .claude/hooks/validate-commit-msg.sh — Claude Code PreToolUse hook on Bash.
#
# Intercepts `git commit -m "..."` calls before they execute and validates
# the subject line against the project's commit convention by delegating
# to hooks/commit-msg (the canonical validator).
#
# This is a fast-fail convenience layer for the common case (-m / --message
# arguments). Edge cases (-F, editor mode, unusual quoting) fall through and
# are caught by the git commit-msg hook itself.
#
# Wired in: .claude/settings.json under PreToolUse → Bash matcher.

INPUT=$(cat)
COMMAND=$(echo "$INPUT" | jq -r '.tool_input.command // ""' 2>/dev/null)

# Fast exit unless this looks like a git commit
echo "$COMMAND" | grep -qE '\bgit\b.*\bcommit\b' || exit 0

# Skip --amend without a new -m (re-uses prior message; commit-msg hook still runs)
if echo "$COMMAND" | grep -qE '\bcommit\b.*--amend' && ! echo "$COMMAND" | grep -qE -- '(-m|--message)\b'; then
  exit 0
fi

# Extract the FIRST -m / --message argument (the subject). A greedy
# `s/.*-m .../` would capture the LAST -m — i.e. the body of a
# multi-paragraph commit — and wrongly validate that (BUG-016). grep -o
# emits every match on its own line, so head -1 is genuinely the first.
first_match() {
  printf '%s\n' "$COMMAND" | grep -oE -e "$1" | head -1 | sed -E "$2"
}
SUBJECT=$(first_match '(-m|--message)[[:space:]]+"[^"]*"' 's/^[^"]*"//; s/"$//')
[ -z "$SUBJECT" ] && SUBJECT=$(first_match "(-m|--message)[[:space:]]+'[^']*'" "s/^[^']*'//; s/'\$//")
[ -z "$SUBJECT" ] && SUBJECT=$(first_match '--message=[^[:space:]]+' 's/^--message=//')

# Truncate to first newline (subject is the first line only)
SUBJECT="${SUBJECT%%$'\n'*}"

# If we couldn't extract anything, let the git commit-msg hook be the gate
[ -z "$SUBJECT" ] && exit 0

# Find the project's hook script
CWD=$(echo "$INPUT" | jq -r '.cwd // "."' 2>/dev/null)
HOOK="$CWD/hooks/commit-msg"

if [ ! -f "$HOOK" ]; then
  # No project hook installed yet (e.g. on a fresh clone before npm install)
  exit 0
fi

TMPFILE=$(mktemp 2>/dev/null || echo "${TMPDIR:-/tmp}/commit-msg-validate-$$")
printf '%s\n' "$SUBJECT" > "$TMPFILE"

if ! bash "$HOOK" "$TMPFILE" >&2; then
  rm -f "$TMPFILE"
  echo "" >&2
  echo "Blocked by .claude/hooks/validate-commit-msg.sh — see CONTRIBUTING.md for the commit format." >&2
  exit 2
fi

rm -f "$TMPFILE"
exit 0
