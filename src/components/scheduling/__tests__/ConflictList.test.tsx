import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import type { Conflict } from '@shared/conflicts';
import { ConflictList } from '../ConflictList';

const conflict: Conflict = {
  id: 'NO_OVERLAP:a1:p1',
  code: 'NO_OVERLAP',
  severity: 'blocking',
  overridable: true,
  assignmentId: 'a1',
  personnelId: 'p1',
  subject: 'דניאל',
  message: 'לא ניתן לשבץ את דניאל למשימה זו — קיימת חפיפה עם מטבח בין 14:00–18:00.',
  resolution: 'הסירו את השיבוץ הכפול או שנו את שעות אחת המשימות.',
};

describe('ConflictList', () => {
  it('shows what happened, who it affects and how to resolve it', () => {
    render(<ConflictList conflicts={[conflict]} />);
    expect(screen.getByText('דניאל')).toBeInTheDocument();
    expect(screen.getByText(conflict.message)).toBeInTheDocument();
    expect(screen.getByText(/הסירו את השיבוץ הכפול/)).toBeInTheDocument();
  });

  it('labels severity in Hebrew rather than by colour alone', () => {
    render(<ConflictList conflicts={[conflict]} />);
    expect(screen.getByText('חוסם')).toBeInTheDocument();
  });

  it('renders an empty state when there is nothing to report', () => {
    render(<ConflictList conflicts={[]} />);
    expect(screen.getByText(/לא נמצאו התנגשויות/)).toBeInTheDocument();
  });
});
