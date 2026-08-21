import type { ReactNode } from 'react';

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2 sm:mb-4 sm:gap-3">
      <div>
        <h1 className="text-lg font-semibold text-ink sm:text-2xl">{title}</h1>
        {description ? (
          <p className="mt-0.5 max-w-2xl text-xs text-ink-muted sm:mt-1 sm:text-sm">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
