import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApprovalModal } from '../game/modals.jsx';
import { useApprovalRequests } from '../app/useApprovalRequests.js';

describe('ApprovalModal (presentation)', () => {
  it('renders nothing when there is no pending request', () => {
    const { container } = render(
      <ApprovalModal pending={null} onApprove={() => {}} onReject={() => {}} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders the runId, summary text, and file list when pending', () => {
    const pending = {
      runId: 'run-abc',
      summary: { text: 'about to edit', files: ['lib/foo.js', 'lib/bar.js'] },
    };
    render(<ApprovalModal pending={pending} onApprove={() => {}} onReject={() => {}} />);
    expect(screen.getByText(/AGENT REQUESTS APPROVAL/i)).toBeInTheDocument();
    expect(screen.getByText('run-abc')).toBeInTheDocument();
    expect(screen.getByText('about to edit')).toBeInTheDocument();
    expect(screen.getByText('· lib/foo.js')).toBeInTheDocument();
    expect(screen.getByText('· lib/bar.js')).toBeInTheDocument();
  });

  it('Approve and Reject buttons fire the right callbacks', async () => {
    const user = userEvent.setup();
    const onApprove = vi.fn();
    const onReject = vi.fn();
    render(
      <ApprovalModal
        pending={{ runId: 'r1', summary: { text: 'change set', files: [] } }}
        onApprove={onApprove}
        onReject={onReject}
      />,
    );
    await user.click(screen.getByRole('button', { name: /✓ Approve/ }));
    expect(onApprove).toHaveBeenCalledTimes(1);
    expect(onReject).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /✕ Reject/ }));
    expect(onReject).toHaveBeenCalledTimes(1);
  });
});

function fakeApi() {
  let cb = null;
  const onEvent = vi.fn((handler) => {
    cb = handler;
    return () => { cb = null; };
  });
  return {
    agents: {
      onEvent,
      listPendingApprovals: vi.fn(async () => []),
      approve: vi.fn(async () => undefined),
      reject: vi.fn(async () => undefined),
    },
    emit: (payload) => { if (cb) cb(payload); },
  };
}

function ProbeWithApi({ api }) {
  const { pending, queue, approve, reject } = useApprovalRequests({ api });
  return (
    <div>
      <span data-testid="pending-runId">{pending?.runId || ''}</span>
      <span data-testid="queue-length">{queue.length}</span>
      <button data-testid="approve" onClick={() => pending && approve(pending.runId)}>approve</button>
      <button data-testid="reject" onClick={() => pending && reject(pending.runId)}>reject</button>
    </div>
  );
}

describe('useApprovalRequests', () => {
  it('starts empty', () => {
    const api = fakeApi();
    render(<ProbeWithApi api={api} />);
    expect(screen.getByTestId('queue-length').textContent).toBe('0');
    expect(screen.getByTestId('pending-runId').textContent).toBe('');
  });

  it('appends a needsApproval event to the queue', async () => {
    const api = fakeApi();
    render(<ProbeWithApi api={api} />);
    act(() => {
      api.emit({
        runId: 'run-x',
        event: {
          runId: 'run-x', t: '12:00', kind: 'plan', text: 'planning',
          payload: { needsApproval: true, text: 'about to edit', files: ['a.js'] },
        },
      });
    });
    expect(screen.getByTestId('pending-runId').textContent).toBe('run-x');
    expect(screen.getByTestId('queue-length').textContent).toBe('1');
  });

  it('ignores events without a needsApproval payload', () => {
    const api = fakeApi();
    render(<ProbeWithApi api={api} />);
    act(() => {
      api.emit({ runId: 'run-x', event: { runId: 'run-x', kind: 'plan', text: 'no payload' } });
    });
    expect(screen.getByTestId('queue-length').textContent).toBe('0');
  });

  it('dedupes by runId — a second event for the same run does not enqueue twice', () => {
    const api = fakeApi();
    render(<ProbeWithApi api={api} />);
    const fire = () => act(() => api.emit({
      runId: 'run-x', event: { runId: 'run-x', kind: 'plan', text: '...', payload: { needsApproval: true } },
    }));
    fire();
    fire();
    expect(screen.getByTestId('queue-length').textContent).toBe('1');
  });

  it('approve calls citybaseApi.agents.approve and removes the head', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<ProbeWithApi api={api} />);
    act(() => api.emit({ runId: 'r1', event: { runId: 'r1', kind: 'plan', text: '...', payload: { needsApproval: true } } }));
    await user.click(screen.getByTestId('approve'));
    await waitFor(() => {
      expect(api.agents.approve).toHaveBeenCalledWith('r1');
    });
    expect(screen.getByTestId('queue-length').textContent).toBe('0');
  });

  it('reject calls citybaseApi.agents.reject and removes the head', async () => {
    const user = userEvent.setup();
    const api = fakeApi();
    render(<ProbeWithApi api={api} />);
    act(() => api.emit({ runId: 'r2', event: { runId: 'r2', kind: 'plan', text: '...', payload: { needsApproval: true } } }));
    await user.click(screen.getByTestId('reject'));
    await waitFor(() => {
      expect(api.agents.reject).toHaveBeenCalledWith('r2');
    });
    expect(screen.getByTestId('queue-length').textContent).toBe('0');
  });

  it('hydrates from listPendingApprovals on mount', async () => {
    const api = fakeApi();
    api.agents.listPendingApprovals = vi.fn(async () => [
      { runId: 'pre-1', summary: { text: 'queued before mount' } },
    ]);
    render(<ProbeWithApi api={api} />);
    await waitFor(() => {
      expect(screen.getByTestId('pending-runId').textContent).toBe('pre-1');
    });
  });
});
