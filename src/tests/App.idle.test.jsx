import { render, screen, act } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';

// Phase 0 contract: no provider yet, so the app must not pretend any work is happening.
// No quests, no team, no toasts, no LIVE pulse, no fake metrics — only "unlinked" until
// a real provider is wired in Phase 1+.
describe('App idle defaults (no fake activity)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('shows the unlinked status pill on first load', () => {
    render(<App />);
    expect(screen.getByText('unlinked')).toBeInTheDocument();
  });

  it('renders no quest IDs (no JIRA-* or BB-* tickets)', () => {
    render(<App />);
    const questIds = screen.queryAllByText(/^(JIRA|BB)-\d+$/);
    expect(questIds).toHaveLength(0);
  });

  it('shows the NO WORKSPACE LINK overlay over the city', () => {
    render(<App />);
    expect(screen.getByText('NO WORKSPACE LINK')).toBeInTheDocument();
  });

  it('renders the unlinked vitals placeholder instead of a fake repo name', () => {
    render(<App />);
    expect(screen.getByText('— unlinked —')).toBeInTheDocument();
  });

  it('does not auto-toast on a fresh load (no scheduled XP toasts)', () => {
    vi.useFakeTimers();
    render(<App />);
    act(() => {
      vi.advanceTimersByTime(20000);
    });
    expect(screen.queryByText(/\+240 XP/)).not.toBeInTheDocument();
  });
});
