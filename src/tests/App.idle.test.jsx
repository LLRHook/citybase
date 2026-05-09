import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import App from '../App.jsx';

// Phase 0 contract: no provider yet, so the app must not pretend any work is happening.
// No quests, no team, no toasts, no LIVE pulse, no fake metrics — only "unlinked" until
// a real provider is wired in Phase 1+. This applies to every view, not just the city.
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

  it('Kanban view shows zero quests and no seed sagas when toggled', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /KANBAN/ }));
    expect(screen.getByText(/0 quests/)).toBeInTheDocument();
    const sagaIds = screen.queryAllByText(/^SAGA-\d+$/);
    expect(sagaIds).toHaveLength(0);
  });

  it('Analysis view shows the empty prompt with no selectable adventurers', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /ANALYSIS/ }));
    expect(screen.getByText(/no analysis available/i)).toBeInTheDocument();
    expect(screen.queryByText('Alpha-7')).not.toBeInTheDocument();
    expect(screen.queryByText('Delta-3')).not.toBeInTheDocument();
  });

  it('Tweaks panel renders an Agents section with codex/claude install rows', async () => {
    render(<App />);
    expect(screen.getByText('Agents')).toBeInTheDocument();
    expect(screen.getByText('codex')).toBeInTheDocument();
    expect(screen.getByText('claude')).toBeInTheDocument();
    // Browser stub resolves to both not-found, so the rows should land in
    // the bad/not-installed state once detection completes.
    await waitFor(() => {
      const rows = screen.getAllByRole('status');
      expect(rows.some(r => r.getAttribute('data-state') === 'bad')).toBe(true);
    });
  });

  it('Provider radio defaults to Auto', () => {
    render(<App />);
    const auto = screen.getByRole('radio', { name: /auto/i });
    expect(auto.getAttribute('aria-checked')).toBe('true');
    const codex = screen.getByRole('radio', { name: /^codex$/i });
    const claude = screen.getByRole('radio', { name: /^claude$/i });
    expect(codex.getAttribute('aria-checked')).toBe('false');
    expect(claude.getAttribute('aria-checked')).toBe('false');
  });

  it('renders a DISPATCH agent tile in the city ActionBar', () => {
    render(<App />);
    expect(screen.getByRole('button', { name: /DISPATCH/ })).toBeInTheDocument();
  });

  it('clicking DISPATCH without a workspace surfaces an "Open a workspace first" toast', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /DISPATCH/ }));
    expect(await screen.findByText(/Open a workspace first/i)).toBeInTheDocument();
  });

  it('does not render the approval modal in idle state (no pending requests)', () => {
    render(<App />);
    expect(screen.queryByText(/AGENT REQUESTS APPROVAL/i)).not.toBeInTheDocument();
  });

  it('renders a disabled BranchSelector showing "—" when no workspace is linked', () => {
    render(<App />);
    const selector = screen.getByRole('button', { name: /Branch selector/i });
    expect(selector).toBeInTheDocument();
    expect(selector).toBeDisabled();
    expect(selector.textContent).toContain('—');
  });

  it('does not surface a CLEAN/DIRTY pill in idle (no workspace)', () => {
    render(<App />);
    expect(screen.queryByText(/^CLEAN$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^DIRTY/)).not.toBeInTheDocument();
  });
});
