// branchSelector.jsx — top-bar UI that lists branches reported by
// gitService.getBranches and lets the user record a pending selection.
//
// Slice 1 scope: read-only selection. Picking a branch other than the
// current checkout records the choice via onSelect (App.jsx writes it
// to tweaks.selectedBranch) but does NOT yet run a checkout.
// Phase-5 slice 4 will add the explicit checkout / commit action.
import React from 'react';
import { NEON, alpha } from './palette.js';
import { Mono, Pill } from './theme.jsx';

function isWorkspaceLinked(workspaceId) {
  return typeof workspaceId === 'string' && workspaceId.length > 0;
}

export function BranchSelector({
  workspaceId,
  currentBranch,
  dirty = false,
  fileCount = 0,
  selectedBranch,
  onSelect,
  onCheckout,
  api,
}) {
  const [open, setOpen] = React.useState(false);
  const [branches, setBranches] = React.useState([]);
  const [loadStatus, setLoadStatus] = React.useState('idle');

  const linked = isWorkspaceLinked(workspaceId);
  const label = currentBranch || '—';
  const pendingDifferent = selectedBranch && selectedBranch !== currentBranch;

  // Lazily load branches the first time the panel opens for a given
  // workspaceId. Re-fetch when the workspace changes.
  const fetchBranches = React.useCallback(async () => {
    if (!linked || !api?.git?.listBranches) return;
    setLoadStatus('loading');
    try {
      const list = await api.git.listBranches(workspaceId);
      setBranches(Array.isArray(list) ? list : []);
      setLoadStatus('ready');
    } catch {
      setBranches([]);
      setLoadStatus('error');
    }
  }, [api, workspaceId, linked]);

  const handleToggle = () => {
    if (!linked) return;
    if (!open && loadStatus !== 'loading') {
      fetchBranches();
    }
    setOpen((v) => !v);
  };

  const handlePick = (name) => {
    if (typeof onSelect === 'function') onSelect(name);
    setOpen(false);
  };

  // If the user clicks outside, dismiss the panel.
  React.useEffect(() => {
    if (!open) return undefined;
    const onDown = (e) => {
      const root = wrapperRef.current;
      if (root && !root.contains(e.target)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const wrapperRef = React.useRef(null);

  return (
    <div ref={wrapperRef} style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}>
      <Mono size={9} color="ink3">BRANCH</Mono>
      <button
        type="button"
        onClick={handleToggle}
        disabled={!linked}
        aria-label="Branch selector"
        aria-expanded={open}
        style={{
          fontFamily: 'JetBrains Mono, monospace', fontSize: 10, fontWeight: 700,
          padding: '4px 8px',
          border: `1px solid ${alpha(NEON.cyan, linked ? 0.45 : 0.15)}`,
          background: linked ? alpha(NEON.cyan, 0.08) : 'transparent',
          color: linked ? NEON.cyan : NEON.ink3,
          cursor: linked ? 'pointer' : 'default',
          borderRadius: 2,
          display: 'inline-flex', alignItems: 'center', gap: 6,
        }}
      >
        <span>{label}</span>
        {linked && <span style={{ color: NEON.ink3, fontSize: 9 }}>{open ? '▴' : '▾'}</span>}
      </button>
      {pendingDifferent && !dirty && typeof onCheckout === 'function' && (
        <button
          type="button"
          onClick={() => onCheckout(selectedBranch)}
          aria-label={`Checkout ${selectedBranch}`}
          style={{
            fontFamily: 'JetBrains Mono, monospace', fontSize: 9, fontWeight: 700,
            letterSpacing: 1, padding: '4px 8px',
            border: `1px solid ${alpha(NEON.green, 0.7)}`,
            background: alpha(NEON.green, 0.15),
            color: NEON.green, cursor: 'pointer', borderRadius: 2,
            display: 'inline-flex', alignItems: 'center', gap: 4,
          }}
        >
          ↳ CHECKOUT {selectedBranch}
        </button>
      )}
      {pendingDifferent && dirty && (
        <Pill color="amber">
          → {selectedBranch} (commit first)
        </Pill>
      )}
      {pendingDifferent && !dirty && typeof onCheckout !== 'function' && (
        <Pill color="amber">
          → {selectedBranch}
        </Pill>
      )}
      {linked && (
        <Pill color={dirty ? 'amber' : 'green'}>
          {dirty ? `DIRTY · ${fileCount}` : 'CLEAN'}
        </Pill>
      )}

      {open && linked && (
        <div
          role="listbox"
          aria-label="Branches"
          style={{
            position: 'absolute', top: 'calc(100% + 4px)', left: 0,
            minWidth: 220, maxWidth: 340, maxHeight: 280, overflow: 'auto',
            background: alpha(NEON.bg1, 0.96),
            border: `1px solid ${alpha(NEON.cyan, 0.5)}`,
            borderRadius: 4,
            boxShadow: `0 8px 24px ${alpha(NEON.bg0, 0.7)}`,
            padding: 4, zIndex: 50,
          }}
        >
          {loadStatus === 'loading' && (
            <Mono size={10} color="ink3" style={{ padding: 8 }}>loading branches…</Mono>
          )}
          {loadStatus === 'error' && (
            <Mono size={10} color="red" style={{ padding: 8 }}>failed to load branches</Mono>
          )}
          {loadStatus === 'ready' && branches.length === 0 && (
            <Mono size={10} color="ink3" style={{ padding: 8 }}>no branches reported</Mono>
          )}
          {branches.map((b) => {
            const isSel = (selectedBranch && b.name === selectedBranch);
            const isCurrent = b.isCurrent;
            const accent = isCurrent ? NEON.cyan : NEON.ink2;
            return (
              <button
                key={b.name}
                type="button"
                role="option"
                aria-selected={isSel}
                onClick={() => handlePick(b.name)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '6px 8px', border: 'none',
                  background: isSel ? alpha(NEON.amber, 0.18) : 'transparent',
                  color: accent, cursor: 'pointer', textAlign: 'left',
                  fontFamily: 'JetBrains Mono, monospace', fontSize: 10,
                  fontWeight: isCurrent ? 700 : 500,
                  borderLeft: `3px solid ${isCurrent ? NEON.cyan : 'transparent'}`,
                }}
              >
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {b.name}
                </span>
                {b.upstream && (
                  <span style={{ color: NEON.ink3, fontSize: 9 }}>↥ {b.upstream}</span>
                )}
                {isCurrent && <span style={{ color: NEON.green, fontSize: 9 }}>✓</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
