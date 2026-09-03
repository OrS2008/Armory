import { summarizeBalance, type Balance } from '@shared/fairness';
import { t } from '@/i18n';
import type { WorkloadRow } from '@/hooks/queries';

/**
 * Which column the balance is measured on. Nights and weekends are where an
 * uneven roster is felt first, so each is measurable in its own right rather
 * than folded into a total that hides them.
 */
export type Measure = 'totalHours' | 'nightHours' | 'weekendHours';

export const measureLabels: Record<Measure, string> = {
  totalHours: t('reports.totalHours'),
  nightHours: t('reports.nightHours'),
  weekendHours: t('reports.weekendHours'),
};

export function balanceOf(rows: WorkloadRow[], measure: Measure): Balance {
  return summarizeBalance(
    rows.map((row) => ({ personnelId: row.personnelId, value: row[measure] })),
  );
}
