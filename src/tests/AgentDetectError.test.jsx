// R17 regression (part of BUG-002): a detect *error* must render distinctly
// from "not installed" — when the scan itself failed we don't know what's
// installed, and the install hint would mislead.
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EmptyHome } from '../views/EmptyHome.jsx';
import { TopBar } from '../views/TopBar.jsx';

const errorDetect = {
  status: 'error',
  result: { codex: { found: false }, claude: { found: false } },
  error: { message: 'PATH scan exploded' },
};

const readyNotFound = {
  status: 'ready',
  result: { codex: { found: false }, claude: { found: false } },
  error: null,
};

describe('EmptyHome agent rows on detect error (R17)', () => {
  it('renders "detect failed" with the message instead of "not installed"', () => {
    render(<EmptyHome onPickWorkspace={() => {}} agentDetect={errorDetect} />);
    expect(screen.getAllByText(/detect failed: PATH scan exploded/i)).toHaveLength(2);
    expect(screen.queryByText(/not installed/i)).not.toBeInTheDocument();
  });

  it('suppresses the install hints when detection itself failed', () => {
    render(<EmptyHome onPickWorkspace={() => {}} agentDetect={errorDetect} />);
    expect(screen.queryByText(/Install Claude Code CLI/i)).not.toBeInTheDocument();
  });

  it('still renders "not installed" + hint for a clean not-found result', () => {
    render(<EmptyHome onPickWorkspace={() => {}} agentDetect={readyNotFound} />);
    expect(screen.getAllByText(/not installed/i)).toHaveLength(2);
    expect(screen.getByText(/Install Claude Code CLI/i)).toBeInTheDocument();
  });
});

describe('TopBar agent dots on detect error (R17)', () => {
  const topBarProps = {
    workspace: null,
    snapshot: null,
    onPickWorkspace: () => {},
    onRefreshWorkspace: () => {},
    onCloseWorkspace: () => {},
    selectedBranch: null,
    onSelectBranch: () => {},
    onCheckoutBranch: () => {},
    citybaseApi: null,
  };

  it('renders "detect failed" chips instead of "not installed"', () => {
    render(<TopBar {...topBarProps} agentDetect={errorDetect} />);
    expect(screen.getAllByText(/detect failed/i)).toHaveLength(2);
    expect(screen.queryByText(/not installed/i)).not.toBeInTheDocument();
  });

  it('keeps "not installed" for a clean not-found result', () => {
    render(<TopBar {...topBarProps} agentDetect={readyNotFound} />);
    expect(screen.getAllByText(/not installed/i)).toHaveLength(2);
  });
});
