import { Fragment, type ReactNode } from 'react';
import { cn } from '@/lib/cn';
import { useIsWide } from '@/hooks/useMediaQuery';
import { TableWrapper, Td, Th } from './Table';

/**
 * Where a column's value lands once the row is drawn as a phone card.
 *
 * `title` is the heading line, `badge` sits opposite it, `actions` form the
 * button row at the bottom, and `meta` — the default — prints the column
 * header as a label beside the value.
 */
export type ColumnPlacement = 'title' | 'badge' | 'meta' | 'actions' | 'hidden';

export interface Column<T> {
  key: string;
  header: string;
  /** Return `null` for "nothing here": the table prints an em dash, the card omits the line. */
  cell: (row: T) => ReactNode;
  placement?: ColumnPlacement;
  className?: string;
}

interface DataTableProps<T> {
  rows: readonly T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Describes the table for screen readers; visually hidden. */
  caption: string;
}

function isBlank(node: ReactNode): boolean {
  if (node === null || node === undefined || node === false || node === '') return true;
  return Array.isArray(node) && node.every(isBlank);
}

/**
 * One list, two shapes. Wide screens get a real table; phones get a card per
 * row, because six columns squeezed into 375px is a sideways scrollbar with
 * the actions column parked off the edge of the screen.
 */
export function DataTable<T>({ rows, columns, rowKey, caption }: DataTableProps<T>) {
  const wide = useIsWide();
  const visible = columns.filter((column) => column.placement !== 'hidden');

  if (wide) {
    return (
      <TableWrapper>
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr>
            {visible.map((column) => (
              <Th key={column.key}>{column.header}</Th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="hover:bg-surface-sunken">
              {visible.map((column) => {
                const content = column.cell(row);
                if (column.placement === 'actions') {
                  return (
                    <Td
                      key={column.key}
                      {...(column.className ? { className: column.className } : {})}
                    >
                      <div className="flex flex-wrap gap-1">{content}</div>
                    </Td>
                  );
                }
                return (
                  <Td
                    key={column.key}
                    {...(column.className ? { className: column.className } : {})}
                  >
                    {isBlank(content) ? <span className="text-ink-faint">—</span> : content}
                  </Td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </TableWrapper>
    );
  }

  return (
    <ul className="divide-y divide-border-subtle">
      {rows.map((row) => {
        const cells = visible.map((column) => ({ column, content: column.cell(row) }));
        const titles = cells.filter((entry) => entry.column.placement === 'title');
        const badges = cells.filter(
          (entry) => entry.column.placement === 'badge' && !isBlank(entry.content),
        );
        const actions = cells.filter(
          (entry) => entry.column.placement === 'actions' && !isBlank(entry.content),
        );
        const meta = cells.filter(
          (entry) => (entry.column.placement ?? 'meta') === 'meta' && !isBlank(entry.content),
        );

        return (
          <li key={rowKey(row)} className="flex flex-col gap-2 p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 font-medium text-ink">
                {titles.map((entry) => (
                  <Fragment key={entry.column.key}>{entry.content}</Fragment>
                ))}
              </div>
              {badges.length > 0 ? (
                <div className="flex shrink-0 flex-wrap items-center justify-end gap-1">
                  {badges.map((entry) => (
                    <Fragment key={entry.column.key}>{entry.content}</Fragment>
                  ))}
                </div>
              ) : null}
            </div>

            {meta.length > 0 ? (
              <dl className="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-sm">
                {meta.map((entry) => (
                  <Fragment key={entry.column.key}>
                    <dt className="text-ink-muted">{entry.column.header}</dt>
                    <dd className="min-w-0 text-ink">
                      {entry.column.className ? (
                        // The column class is written for a table cell; inside a
                        // card it has to hug its label instead of drifting to the
                        // far edge of the row, so it rides on an inline box.
                        <span className={cn('inline-block max-w-full', entry.column.className)}>
                          {entry.content}
                        </span>
                      ) : (
                        entry.content
                      )}
                    </dd>
                  </Fragment>
                ))}
              </dl>
            ) : null}

            {actions.length > 0 ? (
              <div className="flex flex-wrap gap-2 [&>button]:h-10 [&>button]:px-4">
                {actions.map((entry) => (
                  <Fragment key={entry.column.key}>{entry.content}</Fragment>
                ))}
              </div>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
