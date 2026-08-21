import { t } from '@/i18n';

/**
 * A numbered "do this, then this" strip. The board is the one screen where the
 * order of operations is not obvious from the controls, so we spell it out.
 */
export function StepsHint({ steps }: { steps: string[] }) {
  return (
    <ol className="mb-4 flex flex-wrap gap-x-4 gap-y-2 rounded-[var(--radius-card)] border border-border-subtle bg-surface-sunken px-3 py-2 text-sm text-ink-muted">
      {steps.map((step, index) => (
        <li key={step} className="flex items-center gap-2">
          <span
            aria-label={t('app.step', { n: index + 1 })}
            className="ltr-inline inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700"
          >
            {index + 1}
          </span>
          {step}
        </li>
      ))}
    </ol>
  );
}
