import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

/** Wide tables scroll inside their own container, never the page body. */
export function TableWrapper({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('app-scrollbar w-full overflow-x-auto', className)}>
      <table className="w-full min-w-[36rem] border-collapse text-right text-sm">{children}</table>
    </div>
  );
}

export function Th({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <th
      scope="col"
      className={cn(
        'border-b border-border-subtle px-3 py-2 text-start text-xs font-semibold text-ink-muted',
        className,
      )}
    >
      {children}
    </th>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <td
      className={cn('border-b border-border-subtle px-3 py-2.5 text-start align-middle', className)}
    >
      {children}
    </td>
  );
}
