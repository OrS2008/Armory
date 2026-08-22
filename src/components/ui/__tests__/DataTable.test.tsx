import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DataTable, type Column } from '../DataTable';

interface Row {
  id: string;
  name: string;
  unit: string | null;
}

const columns: Column<Row>[] = [
  { key: 'name', header: 'שם', placement: 'title', cell: (row) => row.name },
  { key: 'unit', header: 'מסגרת', cell: (row) => row.unit },
  { key: 'actions', header: 'פעולות', placement: 'actions', cell: () => <button>עריכה</button> },
];

const rows: Row[] = [
  { id: '1', name: 'רס״ל כהן', unit: 'מחלקה א' },
  { id: '2', name: 'סמל לוי', unit: null },
];

/** jsdom has no matchMedia; the component treats "missing" as the wide layout. */
function setViewport(wide: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn(() => ({
      matches: wide,
      addEventListener: () => {},
      removeEventListener: () => {},
    })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('DataTable', () => {
  it('renders a table on wide screens', () => {
    setViewport(true);
    render(<DataTable rows={rows} columns={columns} rowKey={(row) => row.id} caption="כוח אדם" />);

    const table = screen.getByRole('table', { name: 'כוח אדם' });
    expect(within(table).getByRole('columnheader', { name: 'מסגרת' })).toBeInTheDocument();
    expect(within(table).getAllByRole('row')).toHaveLength(3);
    // A missing value still occupies its cell, so the columns stay aligned.
    expect(within(table).getByText('—')).toBeInTheDocument();
  });

  it('renders labelled cards on phones and drops empty lines', () => {
    setViewport(false);
    render(<DataTable rows={rows} columns={columns} rowKey={(row) => row.id} caption="כוח אדם" />);

    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    const items = screen.getAllByRole('listitem');
    expect(items).toHaveLength(2);
    // The first card labels its meta line; the second has no unit, so no line.
    expect(within(items[0] as HTMLElement).getByText('מסגרת')).toBeInTheDocument();
    expect(within(items[1] as HTMLElement).queryByText('מסגרת')).not.toBeInTheDocument();
    expect(within(items[1] as HTMLElement).queryByText('—')).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'עריכה' })).toHaveLength(2);
  });
});
