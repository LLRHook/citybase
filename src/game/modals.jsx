import { useEffect, useId, useRef } from 'react';

export function ApprovalModal({ pending, onApprove, onReject }) {
  const titleId = useId();
  const dialog = useRef(null);
  useEffect(() => {
    if (!pending) return undefined;
    const before = document.activeElement;
    dialog.current?.querySelector('button')?.focus();
    return () => { if (before?.isConnected) before.focus(); };
  }, [pending]);
  if (!pending) return null;
  const summary = pending.summary || {};
  const onKeyDown = event => {
    if (event.key === 'Escape') { event.stopPropagation(); onReject(); }
    if (event.key === 'Tab') {
      const buttons = dialog.current?.querySelectorAll('button');
      const first = buttons?.[0], last = buttons?.[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
  };
  return <div className="approval-backdrop" onClick={onReject}>
    <section ref={dialog} className="approval-permit" role="dialog" aria-modal="true" aria-labelledby={titleId} onKeyDown={onKeyDown} onClick={event => event.stopPropagation()}>
      <div className="order-kicker"><span>WORK PERMIT</span><span>{pending.runId.slice(0, 8)}</span></div>
      <span className="permit-mode">{summary.readOnly ? 'SURVEY / READ ONLY' : 'BUILD / FILE ACCESS'}</span>
      <h2 id={titleId}>{summary.readOnly ? 'Send an agent to scout this city' : 'Agent is about to apply file changes'}</h2>
      {summary.text && <p className="permit-prompt">{summary.text}</p>}
      {summary.rootPath && <p className="permit-path">{summary.rootPath}</p>}
      {Array.isArray(summary.files) && summary.files.length > 0 && <div className="permit-files"><strong>{summary.files.length} FILE{summary.files.length === 1 ? '' : 'S'} TO TOUCH</strong>{summary.files.map((file, i) => <span key={i}>{file}</span>)}</div>}
      <p className="fine-print">{summary.readOnly ? 'This scouting quest can inspect files but cannot edit them. Rejecting cancels the quest.' : 'Approving lets the agent write to this workspace. Rejecting cancels the quest.'}</p>
      <div className="permit-actions"><button className="secondary-button" onClick={onReject}>Reject</button><button className="primary-button" onClick={onApprove}>Approve</button></div>
    </section>
  </div>;
}

export function Toasts({ toasts }) {
  return <div className="legacy-toasts">{(toasts || []).map(toast => <div key={toast.id} role="status">{toast.icon} {toast.text}</div>)}</div>;
}
