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
});
