import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { StatusBadge } from './StatusBadge';
describe('StatusBadge', () => {
  it('exposes status text independently of color', () => {
    render(<StatusBadge tone="success">מאושר</StatusBadge>);
    expect(screen.getByText('מאושר')).toBeVisible();
  });
});
