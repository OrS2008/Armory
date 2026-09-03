import { formatHours } from '@shared/format';
import { t } from '@/i18n';
import { Card, CardHeader, MetricCard } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import type { WorkloadRow } from '@/hooks/queries';
import { balanceOf, measureLabels, type Measure } from './balance';

/**
 * The table below this sorts by hours, which reads as a leaderboard and says
 * nothing about whether the spread is a problem. This says the other thing: how
 * far apart the ends are, and whether a few people are carrying the company.
 */
export function BalancePanel({
  rows,
  measure,
  onMeasureChange,
}: {
  rows: WorkloadRow[];
  measure: Measure;
  onMeasureChange: (next: Measure) => void;
}) {
  const balance = balanceOf(rows, measure);
  const nameOf = (id: string | null) =>
    rows.find((row) => row.personnelId === id)?.displayName ?? '—';
  // A fifth of the people holding more than a third of the load is the point at
  // which the roster is leaning rather than merely uneven.
  const leaning = (balance.topFifthShare ?? 0) > 0.34;

  return (
    <Card>
      <CardHeader
        title={t('reports.balance')}
        description={t('reports.balanceHint')}
        action={
          <Select
            className="w-auto"
            aria-label={t('reports.measure')}
            value={measure}
            onChange={(event) => onMeasureChange(event.target.value as Measure)}
          >
            {(Object.keys(measureLabels) as Measure[]).map((key) => (
              <option key={key} value={key}>
                {measureLabels[key]}
              </option>
            ))}
          </Select>
        }
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <MetricCard
          label={t('reports.median')}
          value={formatHours(balance.median)}
          hint={t('reports.medianHint')}
        />
        <MetricCard
          label={t('reports.spread')}
          value={formatHours(balance.spread)}
          hint={t('reports.spreadHint')}
          tone={leaning ? 'warning' : 'neutral'}
        />
        <MetricCard
          label={t('reports.topFifth')}
          value={
            balance.topFifthShare === null ? '—' : `${Math.round(balance.topFifthShare * 100)}%`
          }
          hint={t('reports.topFifthHint')}
          tone={leaning ? 'warning' : 'success'}
        />
        <div className="card flex flex-col justify-center gap-1 p-4 text-sm">
          <span className="text-ink-muted">
            {t('reports.heaviest')}:{' '}
            <strong className="font-medium text-ink">{nameOf(balance.heaviest)}</strong>
          </span>
          <span className="text-ink-muted">
            {t('reports.lightest')}:{' '}
            <strong className="font-medium text-ink">{nameOf(balance.lightest)}</strong>
          </span>
        </div>
      </div>
      <p className={`mt-3 text-sm ${leaning ? 'text-warning' : 'text-ink-muted'}`}>
        {leaning ? t('reports.balanceUneven') : t('reports.balanceEven')}
      </p>
    </Card>
  );
}
