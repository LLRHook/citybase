import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { BranchSelector } from '../game/branchSelector.jsx';

function fakeApi(branches) {
  return {
    git: {
      listBranches: vi.fn(async () => branches),
    },
  };
}

describe('BranchSelector', () => {
  it('shows "—" and is disabled when workspaceId is missing', () => {
    render(
      <BranchSelector
        workspaceId={null}
        currentBranch={null}
        api={fakeApi([])}
        onSelect={() => {}}
      />,
    );
    const button = screen.getByRole('button', { name: /Branch selector/i });
    expect(button).toBeDisabled();
    expect(button.textContent).toContain('—');
  });

  it('renders the current branch and the CLEAN pill when not dirty', () => {
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        dirty={false}
        api={fakeApi([])}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByRole('button', { name: /Branch selector/i }).textContent).toContain('main');
    expect(screen.getByText('CLEAN')).toBeInTheDocument();
  });

  it('renders DIRTY · N when the workspace is dirty', () => {
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        dirty
        fileCount={3}
        api={fakeApi([])}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('DIRTY · 3')).toBeInTheDocument();
  });

  it('lists branches once the panel is opened (lazy fetch)', async () => {
    const user = userEvent.setup();
    const api = fakeApi([
      { name: 'main', isCurrent: true, upstream: 'origin/main' },
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]);
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        api={api}
        onSelect={() => {}}
      />,
    );
    expect(api.git.listBranches).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: /Branch selector/i }));
    expect(api.git.listBranches).toHaveBeenCalledWith('ws-1');
    await waitFor(() => {
      expect(screen.getByRole('listbox', { name: /Branches/ })).toBeInTheDocument();
    });
    expect(screen.getByText('feature/x')).toBeInTheDocument();
    // The current-branch button shows up twice once the panel opens (once
    // in the trigger, once as the first option) — both should contain "main".
    expect(screen.getAllByText('main').length).toBeGreaterThanOrEqual(2);
  });

  it('calls onSelect with the picked branch and closes the panel', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const api = fakeApi([
      { name: 'main', isCurrent: true, upstream: null },
      { name: 'feature/x', isCurrent: false, upstream: null },
    ]);
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        api={api}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Branch selector/i }));
    await waitFor(() => screen.getByRole('listbox'));
    await user.click(screen.getByRole('option', { name: /feature\/x/ }));
    expect(onSelect).toHaveBeenCalledWith('feature/x');
    await waitFor(() => {
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    });
  });

  it('shows a "→ <name>" pending pill when selectedBranch differs from currentBranch', () => {
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        selectedBranch="feature/x"
        api={fakeApi([])}
        onSelect={() => {}}
      />,
    );
    expect(screen.getByText('→ feature/x')).toBeInTheDocument();
  });

  it('does NOT show the pending pill when selectedBranch matches the current branch', () => {
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        selectedBranch="main"
        api={fakeApi([])}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByText(/^→ /)).not.toBeInTheDocument();
  });

  it('shows a CHECKOUT button when workspace is clean and selectedBranch differs', async () => {
    const onCheckout = vi.fn();
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        dirty={false}
        selectedBranch="feature/x"
        api={fakeApi([])}
        onSelect={() => {}}
        onCheckout={onCheckout}
      />,
    );
    const button = screen.getByRole('button', { name: /Checkout feature\/x/i });
    expect(button).toBeInTheDocument();
    expect(screen.queryByText('→ feature/x')).not.toBeInTheDocument();
  });

  it('clicking CHECKOUT calls onCheckout with the picked branch name', async () => {
    const user = userEvent.setup();
    const onCheckout = vi.fn();
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        dirty={false}
        selectedBranch="feature/x"
        api={fakeApi([])}
        onSelect={() => {}}
        onCheckout={onCheckout}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Checkout feature\/x/i }));
    expect(onCheckout).toHaveBeenCalledWith('feature/x');
  });

  it('shows a "commit first" pill instead of CHECKOUT when the workspace is dirty', () => {
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        dirty
        fileCount={2}
        selectedBranch="feature/x"
        api={fakeApi([])}
        onSelect={() => {}}
        onCheckout={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Checkout feature\/x/i })).not.toBeInTheDocument();
    expect(screen.getByText(/feature\/x \(commit first\)/)).toBeInTheDocument();
  });

  it('falls back to the static "→" pill when no onCheckout handler is provided', () => {
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        dirty={false}
        selectedBranch="feature/x"
        api={fakeApi([])}
        onSelect={() => {}}
      />,
    );
    expect(screen.queryByRole('button', { name: /Checkout/i })).not.toBeInTheDocument();
    expect(screen.getByText('→ feature/x')).toBeInTheDocument();
  });

  it('renders an error state when the api rejects', async () => {
    const user = userEvent.setup();
    const api = {
      git: { listBranches: vi.fn(async () => { throw new Error('not a repo'); }) },
    };
    render(
      <BranchSelector
        workspaceId="ws-1"
        currentBranch="main"
        api={api}
        onSelect={() => {}}
      />,
    );
    await user.click(screen.getByRole('button', { name: /Branch selector/i }));
    await waitFor(() => {
      expect(screen.getByText(/failed to load branches/i)).toBeInTheDocument();
    });
  });
});
