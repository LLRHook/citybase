import { NEON, alpha } from '../game/palette.js';
import { Mono, NButton, Title, Pill } from '../game/theme.jsx';

// WorkspaceStatusPanel — what fills the main area when the workspace is in
// a broken state instead of pretending everything is fine (BUG-007). Two
// shapes share it:
//   * a workspace operation failed (useWorkspace status === 'error')
//   * the snapshot carries an error (folder is not a git repo, git missing,
//     snapshot IPC failed)
// Both offer retry + pick-another affordances so the user is never stuck.
export function WorkspaceStatusPanel({ kind, error, workspace, onRetry, onPickWorkspace }) {
  const isNoGit = error?.kind === 'no-git';
  const title = kind === 'workspace'
    ? 'Workspace unavailable'
    : isNoGit
      ? 'Not a Git repository'
      : 'Could not read Git state';
  const detail = kind === 'workspace'
    ? 'The last workspace operation failed. Retry, or open a different folder.'
    : isNoGit
      ? 'Citybase projects the city from Git. Initialize a repository in this folder or open one that already has a .git directory.'
      : 'The Git snapshot failed to load. If this keeps happening, check that git is installed and on your PATH.';

  return (
    <div
      role="alert"
      data-testid="workspace-status-panel"
      style={{
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 40,
      }}
    >
      <div style={{ maxWidth: 520, textAlign: 'center' }}>
        <Pill color="red">⚠ {kind === 'workspace' ? 'workspace error' : 'git error'}</Pill>
        <Title size={22} weight={700} style={{ display: 'block', marginTop: 12, letterSpacing: -0.5 }}>
          {title}
        </Title>
        {workspace?.rootPath && (
          <Mono size={10} color="ink3" style={{ display: 'block', marginTop: 8 }}>
            {workspace.rootPath}
          </Mono>
        )}
        <Mono size={12} color="ink2" style={{ display: 'block', marginTop: 10, lineHeight: 1.6 }}>
          {detail}
        </Mono>
        {error?.message && (
          <Mono
            size={10}
            color="red"
            style={{
              display: 'block', marginTop: 14, padding: 10,
              border: `1px solid ${alpha(NEON.red, 0.4)}`,
              background: alpha(NEON.red, 0.06),
              borderRadius: 4,
              textAlign: 'left', whiteSpace: 'pre-wrap', wordBreak: 'break-word',
            }}
          >
            {error.message}
          </Mono>
        )}
        <div style={{ marginTop: 22, display: 'flex', gap: 8, justifyContent: 'center' }}>
          {onRetry && (
            <NButton accent="cyan" onClick={onRetry}>↻ Retry</NButton>
          )}
          <NButton accent="amber" onClick={onPickWorkspace}>＋ Open a different workspace</NButton>
        </div>
      </div>
    </div>
  );
}
