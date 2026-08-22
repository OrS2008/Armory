import { useMemo, useState } from 'react';
import { Download } from 'lucide-react';
import { formatDayKey, formatHours, formatRange } from '@shared/format';
import { DAY, startOfDay } from '@shared/time';
import { t } from '@/i18n';
import { todayKey } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkloadReport, type WorkloadRow } from '@/hooks/queries';

const RANGES = [7, 14, 30, 90] as const;

export function ReportsPage() {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const window = useMemo(() => {
    const to = startOfDay(todayKey()) + DAY;
    return { from: to - rangeDays * DAY, to };
  }, [rangeDays]);

  const report = useWorkloadReport(window);
  const rows = report.data?.workload ?? [];
  const gaps = report.data?.staffingGaps ?? [];

  const exportCsv = () => {
    const header = [
      t('personnel.name'),
      t('personnel.unit'),
      t('reports.totalHours'),
      t('reports.nightHours'),
      t('reports.weekendHours'),
      t('reports.assignmentCount'),
      t('reports.fairnessScore'),
    ];
    const body = rows.map((row: WorkloadRow) => [
      row.displayName,
      row.unitName ?? '',
      row.totalHours,
      row.nightHours,
      row.weekendHours,
      row.assignmentCount,
      row.score,
    ]);
    // UTF-8 BOM so Excel opens Hebrew columns correctly.
    const csv = `\uFEFF${[header, ...body].map((line) => line.join(',')).join('\n')}`;
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `workload-${formatDayKey(todayKey()).replace(/\//g, '-')}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const peakHours = rows.reduce((max, row) => Math.max(max, row.totalHours), 0);

  const columns: Column<WorkloadRow>[] = [
    {
      key: 'name',
      header: t('personnel.name'),
      placement: 'title',
      cell: (row) => row.displayName,
    },
    { key: 'unit', header: t('personnel.unit'), cell: (row) => row.unitName },
    {
      key: 'total',
      header: t('reports.totalHours'),
      cell: (row) => (
        <div className="flex items-center gap-2">
          <span className="ltr-inline tabular-nums">{formatHours(row.totalHours)}</span>
          {peakHours > 0 ? (
            <span
              aria-hidden
              className="hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken sm:block"
            >
              <span
                className="block h-full rounded-full bg-brand-500"
                style={{ inlineSize: `${Math.round((row.totalHours / peakHours) * 100)}%` }}
              />
            </span>
          ) : null}
        </div>
      ),
    },
    {
      key: 'night',
      header: t('reports.nightHours'),
      className: 'ltr-inline tabular-nums',
      cell: (row) => formatHours(row.nightHours),
    },
    {
      key: 'weekend',
      header: t('reports.weekendHours'),
      className: 'ltr-inline tabular-nums',
      cell: (row) => formatHours(row.weekendHours),
    },
    {
      key: 'count',
      header: t('reports.assignmentCount'),
      className: 'ltr-inline tabular-nums',
      cell: (row) => row.assignmentCount,
    },
    {
      key: 'score',
      header: t('reports.fairnessScore'),
      className: 'ltr-inline tabular-nums',
      cell: (row) => row.score,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('reports.title')}
        description={t('reports.subtitle')}
        actions={
          <>
            <Select
              className="w-auto"
              aria-label={t('reports.range')}
              value={rangeDays}
              onChange={(event) => setRangeDays(Number(event.target.value))}
            >
              {RANGES.map((days) => (
                <option key={days} value={days}>
                  {t('reports.rangeDays', { days })}
                </option>
              ))}
            </Select>
            <Button
              variant="secondary"
              size="sm"
              icon={<Download className="size-4" />}
              disabled={rows.length === 0}
              onClick={exportCsv}
            >
              {t('reports.export')}
            </Button>
          </>
        }
      />

      <QueryState
        isLoading={report.isLoading}
        error={report.error}
        isEmpty={rows.length === 0}
        emptyDescription={t('reports.empty')}
        onRetry={() => void report.refetch()}
      >
        <div className="flex flex-col gap-4">
          <div className="card p-0">
            <DataTable
              rows={rows}
              columns={columns}
              rowKey={(row) => row.personnelId}
              caption={t('reports.title')}
            />
          </div>

          {gaps.length > 0 ? (
            <Card>
              <CardHeader title={t('reports.staffingGaps')} />
              <ul className="flex flex-col divide-y divide-border-subtle text-sm">
                {gaps.map((gap) => (
                  <li key={gap.assignmentId} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="font-medium">{gap.title}</span>
                    <span className="ltr-inline text-xs text-ink-muted">
                      {formatRange(gap.startAt, gap.endAt)}
                    </span>
                    <span className="ms-auto text-warning">
                      {gap.missing === 1
                        ? t('schedule.missingOne')
                        : t('schedule.missingPerson', { count: gap.missing })}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </div>
      </QueryState>
    </>
  );
}
