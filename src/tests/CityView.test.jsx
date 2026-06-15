import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { CityView } from '../views/CityView.jsx';

const snapshot = {
  branch: 'main',
  repoTree: [
    'package.json', 'README.md',
    'src/App.jsx', 'src/main.jsx', 'src/index.css',
    'electron/main/main.cjs',
  ],
  files: [
    { path: 'src/App.jsx', status: 'modified', staged: false, unstaged: true },
  ],
};

describe('CityView', () => {
  it('renders an empty state when there is no repo tree', () => {
    render(<CityView snapshot={{ repoTree: [], files: [] }} />);
    expect(screen.getByText(/No city to render yet/i)).toBeInTheDocument();
  });

  it('renders district platforms and building polygons from a snapshot', () => {
    const { container } = render(<CityView snapshot={snapshot} />);
    const polys = container.querySelectorAll('polygon');
    // 3 districts (core, src, electron) → ≥3 platforms, plus 3 faces per building
    expect(polys.length).toBeGreaterThan(10);
    expect(container.querySelector('svg')).toBeTruthy();
  });

  it('labels districts by folder', () => {
    render(<CityView snapshot={snapshot} />);
    expect(screen.getByText('core')).toBeInTheDocument();
    expect(screen.getByText('Src')).toBeInTheDocument();
  });

  it('shows the staged/unstaged legend', () => {
    render(<CityView snapshot={snapshot} />);
    expect(screen.getByText('unstaged')).toBeInTheDocument();
    expect(screen.getByText('staged')).toBeInTheDocument();
    expect(screen.getByText('clean')).toBeInTheDocument();
  });

  it('shows the agent-at-work banner and lights active buildings during a run', () => {
    const { container } = render(
      <CityView
        snapshot={snapshot}
        activeRun={{ runId: 'r1', provider: 'claude', status: 'running' }}
        activePaths={['src/App.jsx']}
        phase={{ phase: 'editing', label: 'editing files' }}
      />,
    );
    expect(screen.getByText(/AGENT AT WORK/i)).toBeInTheDocument();
    expect(screen.getByText(/editing files/i)).toBeInTheDocument();
    expect(container.querySelector('g.city-active')).toBeTruthy();
  });

  it('has no banner when idle', () => {
    render(<CityView snapshot={snapshot} />);
    expect(screen.queryByText(/AGENT AT WORK/i)).not.toBeInTheDocument();
  });

  it('renders a live agent presence over the worked area during a run (FEAT-019)', () => {
    const { container } = render(
      <CityView
        snapshot={snapshot}
        activeRun={{ runId: 'r1', provider: 'claude', status: 'running' }}
        activePaths={['src/App.jsx']}
        phase={{ phase: 'editing', label: 'editing files' }}
      />,
    );
    expect(container.querySelector('.city-scan')).toBeTruthy();
  });

  it('shows no agent presence when idle', () => {
    const { container } = render(<CityView snapshot={snapshot} />);
    expect(container.querySelector('.city-scan')).toBeNull();
  });
});
