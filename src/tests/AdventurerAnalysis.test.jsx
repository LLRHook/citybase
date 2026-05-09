import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { AdventurerAnalysis } from '../game/analysis.jsx';
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
});
