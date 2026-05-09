import { render, screen } from '@testing-library/react';
import App from '../App.jsx';

describe('Quest data smoke', () => {
  it('renders at least one quest ID from seed data (JIRA-* or BB-*)', () => {
    render(<App />);
    const questIds = screen.queryAllByText(/^(JIRA|BB)-\d+$/);
    expect(questIds.length).toBeGreaterThan(0);
  });

  it('renders the mock repo branch name from seed.REPO', () => {
    render(<App />);
    expect(screen.getAllByText('main').length).toBeGreaterThan(0);
  });
});
