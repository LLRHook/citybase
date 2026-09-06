import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useApprovalRequests } from '../app/useApprovalRequests.js';

describe('live approval summaries', () => {
  it.each([true, false])('keeps prompt, workspace and readOnly=%s from the manager envelope', async (readOnly) => {
    let publish;
    const summary = { text: 'Scout the market district', rootPath: '/repo/harbor', readOnly, skill: 'review', branch: 'main' };
    const api = { agents: {
      onEvent: (listener) => { publish = listener; return () => {}; },
      listPendingApprovals: vi.fn(async () => []),
    } };
    const live = renderHook(() => useApprovalRequests({ api }));
    act(() => publish({
      runId: 'scout-1',
      event: { kind: 'plan', payload: { needsApproval: true, summary } },
    }));
    expect(live.result.current.pending).toEqual({ runId: 'scout-1', summary });
    expect(live.result.current.pending.summary.readOnly).toBe(readOnly);

    // A dialog receiving the live event must see the same summary as one
    // mounted after the request was already waiting in the main process.
    const hydratedApi = { agents: {
      onEvent: () => () => {},
      listPendingApprovals: vi.fn(async () => [{ runId: 'scout-1', summary }]),
    } };
    const restored = renderHook(() => useApprovalRequests({ api: hydratedApi }));
    await waitFor(() => expect(restored.result.current.pending).toEqual(live.result.current.pending));
  });
});
