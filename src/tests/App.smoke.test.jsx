import { render, screen } from '@testing-library/react';
import App from '../App.jsx';

describe('App smoke', () => {
  it('renders the CODEBASE COMMAND heading', () => {
    render(<App />);
    expect(screen.getByText('CODEBASE COMMAND')).toBeInTheDocument();
  });

  it('renders all three view-switch labels (CITY, KANBAN, ANALYSIS)', () => {
    render(<App />);
    expect(screen.getAllByText(/CITY/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/KANBAN/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/ANALYSIS/).length).toBeGreaterThan(0);
  });
});
