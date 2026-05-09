import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdventurerAnalysis, RunHistoryPanel } from '../game/analysis.jsx';
import { GUILDS, ADV_REPORTS } from '../data/seed.js';

const DISTRICTS = [
  { id: 'lib', name: 'lib', color: 'amber', q: 0, r: 0, files: 4, health: 100 },
  { id: 'core', name: '/', color: 'white', q: 0, r: 0, files: 0, health: 100 },
];

describe('AdventurerAnalysis (no-code review layout)', () => {
  it("preserves the empty state when no adventurer / report is selected", () => {
    render(
      <AdventurerAnalysis
        advId={null}
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
      />,
    );
    expect(screen.getByText(/no analysis available/i)).toBeInTheDocument();
  });

  it('renders Changed Districts as the primary surface for a seeded run', () => {
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
      />,
    );
    const districtsHeader = screen.getByText('Changed Districts');
    expect(districtsHeader).toBeInTheDocument();
    // Each diff file should appear by its full path under its district pill.
    expect(screen.getByText('lib/github.ts')).toBeInTheDocument();
    expect(screen.getByText('lib/github.test.ts')).toBeInTheDocument();
  });

  it('shows a NEXT ACTION label derived from the run review', () => {
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
      />,
    );
    expect(screen.getByText(/NEXT ACTION/i)).toBeInTheDocument();
    // alpha-7 has a 'lint warn' check, which routes to 'request changes'.
    expect(screen.getByText(/request changes/i)).toBeInTheDocument();
  });

  it('hides the raw-diff drawer by default and reveals it on toggle', async () => {
    const user = userEvent.setup();
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
      />,
    );
    const toggle = screen.getByRole('button', { name: /RAW DIFF · DEBUG/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    // Diff lines (e.g. 'export async function fetchRepos(token: string) {')
    // come from pr.diffs[0].hunks. They MUST NOT be in the document while
    // the drawer is collapsed.
    expect(screen.queryByText(/buildAuthHeaders\(token\)/)).not.toBeInTheDocument();

    await user.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    // Now the drawer is open; one of the seed hunk lines should be visible.
    expect(screen.getByText(/buildAuthHeaders\(token\)/)).toBeInTheDocument();
  });

  it('renders a Risk Assessment with the level / score / factors from runReview', () => {
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
      />,
    );
    expect(screen.getByText('RISK')).toBeInTheDocument();
    // Score is rendered as 'score N/100'
    expect(screen.getByText(/score \d+\/100/)).toBeInTheDocument();
  });

  it('lists the seeded CI checks under CI Checks', () => {
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
      />,
    );
    expect(screen.getByText('CI Checks')).toBeInTheDocument();
    // CheckRow renders each check name verbatim; assert two we know the
    // seed ships for alpha-7. Use a regex to be tolerant of whitespace
    // collapsing inside the rendered Mono component.
    expect(screen.getByText(/unit\s*·\s*vitest/i)).toBeInTheDocument();
    expect(screen.getByText(/e2e\s*·\s*playwright/i)).toBeInTheDocument();
  });

  it('groups files into the (unmapped) bucket when the district list is empty', () => {
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={[]}
        onPickAdv={() => {}}
      />,
    );
    expect(screen.getByText('(unmapped)')).toBeInTheDocument();
  });

  it('renders the COMMIT RESULT card only when the workspace has dirty files', () => {
    const { rerender } = render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        workspaceDirty={0}
        onCommit={() => {}}
      />,
    );
    expect(screen.queryByText('COMMIT RESULT')).not.toBeInTheDocument();

    rerender(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        workspaceDirty={3}
        onCommit={() => {}}
      />,
    );
    expect(screen.getByText('COMMIT RESULT')).toBeInTheDocument();
    expect(screen.getByText('3 dirty files')).toBeInTheDocument();
  });

  it('the Commit button is disabled until a non-empty message is typed', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => ({ ok: true, commitHash: 'abc' }));
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        workspaceDirty={2}
        onCommit={onCommit}
      />,
    );
    const button = screen.getByRole('button', { name: /Commit$/ });
    expect(button).toBeDisabled();
    const textarea = screen.getByLabelText(/Commit message/i);
    await user.type(textarea, 'feat: did the thing');
    expect(button).toBeEnabled();
  });

  it('clicking Commit calls onCommit with the trimmed message and clears on success', async () => {
    const user = userEvent.setup();
    const onCommit = vi.fn(async () => ({ ok: true, commitHash: 'abc' }));
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        workspaceDirty={1}
        onCommit={onCommit}
      />,
    );
    const textarea = screen.getByLabelText(/Commit message/i);
    await user.type(textarea, '   feat: did it   ');
    await user.click(screen.getByRole('button', { name: /Commit$/ }));
    expect(onCommit).toHaveBeenCalledWith('feat: did it');
  });

  it('renders the Run History panel in the empty state with the empty-run message', () => {
    render(
      <AdventurerAnalysis
        advId={null}
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        runs={[]}
      />,
    );
    expect(screen.getByText('Run History')).toBeInTheDocument();
    expect(screen.getByText(/no runs yet · dispatch an agent/i)).toBeInTheDocument();
  });

  it('lists real runs in the empty state when the runs prop is non-empty', () => {
    render(
      <AdventurerAnalysis
        advId={null}
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        runs={[
          { runId: 'aaaaaaaaXX', status: 'done', provider: 'claude', branch: 'main',
            questId: 'TASK-A', adventurerId: 'a1', startedAt: 1_700_000_000_000 },
        ]}
      />,
    );
    expect(screen.queryByText(/no runs yet/i)).not.toBeInTheDocument();
    expect(screen.getByText(/TASK-A · aaaaaaaa/)).toBeInTheDocument();
    expect(screen.getByTestId('run-history-row')).toBeInTheDocument();
  });

  it('renders the Run History panel in the right column when a report is selected', () => {
    render(
      <AdventurerAnalysis
        advId="alpha-7"
        guilds={GUILDS}
        advReports={ADV_REPORTS}
        districts={DISTRICTS}
        onPickAdv={() => {}}
        runs={[
          { runId: 'rrrrrrrr12', status: 'failed', provider: 'claude',
            questId: 'TASK-FAIL', adventurerId: 'a1', startedAt: 1_700_000_000_000 },
        ]}
      />,
    );
    // The seeded report renders, AND the run history shows up alongside.
    expect(screen.getByText('Changed Districts')).toBeInTheDocument();
    expect(screen.getByText('Run History')).toBeInTheDocument();
    expect(screen.getByText(/TASK-FAIL · rrrrrrrr/)).toBeInTheDocument();
  });
});

describe('RunHistoryPanel', () => {
  it('renders the empty-state message when runs is empty or non-array', () => {
    const { rerender } = render(<RunHistoryPanel runs={[]} />);
    expect(screen.getByText(/no runs yet · dispatch an agent/i)).toBeInTheDocument();
    rerender(<RunHistoryPanel runs={null} />);
    expect(screen.getByText(/no runs yet · dispatch an agent/i)).toBeInTheDocument();
  });

  it('renders one row per run with status, provider, branch, and id prefix', () => {
    render(<RunHistoryPanel runs={[
      { runId: '12345678abcd', status: 'running', provider: 'claude',
        branch: 'feature/x', questId: 'Q1', startedAt: 1_700_000_000_000 },
      { runId: 'cancelledAA1', status: 'cancelled', provider: 'claude',
        branch: 'main', questId: 'Q2', startedAt: 1_700_000_000_500 },
    ]} />);
    const rows = screen.getAllByTestId('run-history-row');
    expect(rows).toHaveLength(2);
    expect(screen.getByText(/Q1 · 12345678/)).toBeInTheDocument();
    expect(screen.getByText(/Q2 · cancelle/)).toBeInTheDocument();
    // Status pills appear at least once each.
    expect(screen.getByText('running')).toBeInTheDocument();
    expect(screen.getByText('cancelled')).toBeInTheDocument();
  });

  it('falls back to "(no quest)" when questId is missing', () => {
    render(<RunHistoryPanel runs={[
      { runId: 'noquest123z', status: 'done', provider: 'claude' },
    ]} />);
    // The id is sliced to 8 chars in the rendered row.
    expect(screen.getByText(/\(no quest\) · noquest1/)).toBeInTheDocument();
  });
});
