import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { citybaseApi } from '../app/citybaseApi.js';
import { useWorkspace } from '../app/useWorkspace.js';

afterEach(() => vi.restoreAllMocks());
const workspace = { id: 'ws', name: 'City', rootPath: '/repo' };

describe('useWorkspace recovery', () => {
  it('refreshes once with the workspace id and adopts its fresh snapshot', async () => {
    vi.spyOn(citybaseApi.workspace, 'getCurrent').mockResolvedValue(workspace);
    const initial = vi.spyOn(citybaseApi.git, 'getSnapshot').mockResolvedValue({ branch: 'main' });
    const refresh = vi.spyOn(citybaseApi.git, 'refresh').mockResolvedValue({ branch: 'feature/city' });
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.refresh());
    expect(refresh).toHaveBeenCalledExactlyOnceWith('ws');
    expect(initial).toHaveBeenCalledTimes(1);
    expect(result.current.snapshot.branch).toBe('feature/city');
  });

  it('surfaces startup errors and permits a later successful refresh', async () => {
    const current = vi.spyOn(citybaseApi.workspace, 'getCurrent').mockRejectedValue(new Error('workspace unavailable'));
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.status).toBe('error'));
    expect(result.current.error.message).toBe('workspace unavailable');
    current.mockResolvedValue(workspace);
    vi.spyOn(citybaseApi.git, 'refresh').mockResolvedValue({ branch: 'main' });
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('ready');
    expect(result.current.error).toBeNull();
  });

  it('preserves the current city when a refresh fails', async () => {
    vi.spyOn(citybaseApi.workspace, 'getCurrent').mockResolvedValue(workspace);
    vi.spyOn(citybaseApi.git, 'getSnapshot').mockResolvedValue({ branch: 'main' });
    vi.spyOn(citybaseApi.git, 'refresh').mockRejectedValue(new Error('Git unavailable'));
    const { result } = renderHook(() => useWorkspace());
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(() => result.current.refresh());
    expect(result.current.status).toBe('error');
    expect(result.current.workspace).toEqual(workspace);
    expect(result.current.snapshot.branch).toBe('main');
  });
});
