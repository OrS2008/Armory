import { useMemo, useState } from 'react';
import { FileSpreadsheet, Printer, Table } from 'lucide-react';
import { formatDate, formatDayKey, formatHours, formatRange } from '@shared/format';
import { XLSX_MIME, buildXlsx } from '@shared/xlsx';
import { DAY, startOfDay } from '@shared/time';
import { t } from '@/i18n';
import { todayKey } from '@/lib/datetime';
import { MenuButton } from '@/components/ui/MenuButton';
import { downloadBlob, downloadCsv } from '@/lib/download';
import { Card, CardHeader } from '@/components/ui/Card';
import { Select } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { useWorkloadReport, type WorkloadRow } from '@/hooks/queries';
import { BalancePanel } from './BalancePanel';
import { balanceOf, measureLabels, type Measure } from './balance';

const RANGES = [7, 14, 30, 90] as const;

export function ReportsPage() {
  const [rangeDays, setRangeDays] = useState<number>(30);
  const [measure, setMeasure] = useState<Measure>('totalHours');
  // Named `range`, not `window`: the global one is needed for printing.
  const range = useMemo(() => {
    const to = startOfDay(todayKey()) + DAY;
    return { from: to - rangeDays * DAY, to };
  }, [rangeDays]);

  const report = useWorkloadReport(range);
  const rows = report.data?.workload ?? [];
  const gaps = report.data?.staffingGaps ?? [];
  const balance = balanceOf(rows, measure);

  const stamp = formatDayKey(todayKey()).replace(/\//g, '-');

  const workloadColumns = [
    t('personnel.name'),
    t('personnel.unit'),
    t('reports.totalHours'),
    t('reports.nightHours'),
    t('reports.weekendHours'),
    t('reports.assignmentCount'),
    t('reports.fairnessScore'),
    `${t('reports.deviation')} (${measureLabels[measure]})`,
  ];

  const workloadRow = (row: WorkloadRow) => [
    row.displayName,
    row.unitName ?? '',
    row.totalHours,
    row.nightHours,
    row.weekendHours,
    row.assignmentCount,
    row.score,
    balance.deviation.get(row.personnelId) ?? 0,
  ];

  const exportCsv = () => {
    const body = rows.map(workloadRow);
    const csv = [workloadColumns, ...body].map((line) => line.join(',')).join('\n');
    downloadCsv(`workload-${stamp}.csv`, csv);
  };

  /**
   * A workbook rather than a second CSV: the gaps are a different table, and a
   * single flat file cannot hold both without the reader untangling them.
   */
  const exportExcel = () => {
    const bytes = buildXlsx([
      {
        name: t('reports.sheetWorkload'),
        columns: [
          { header: workloadColumns[0] as string, width: 24 },
          { header: workloadColumns[1] as string, width: 16 },
          { header: workloadColumns[2] as string, width: 12 },
          { header: workloadColumns[3] as string, width: 12 },
          { header: workloadColumns[4] as string, width: 12 },
          { header: workloadColumns[5] as string, width: 14 },
          { header: workloadColumns[6] as string, width: 12 },
          { header: workloadColumns[7] as string, width: 18 },
        ],
        rows: rows.map(workloadRow),
      },
      {
        name: t('reports.sheetGaps'),
        columns: [
          { header: t('assignments.name'), width: 28 },
          { header: t('availability.range'), width: 28 },
          { header: t('reports.gapMissing'), width: 10 },
        ],
        rows: gaps.map((gap) => [gap.title, formatRange(gap.startAt, gap.endAt), gap.missing]),
      },
    ]);
    downloadBlob(`workload-${stamp}.xlsx`, new Blob([bytes as BlobPart], { type: XLSX_MIME }));
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
              className="no-print hidden h-1.5 w-20 overflow-hidden rounded-full bg-surface-sunken sm:block"
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
    {
      /*
       * The one column that answers the question the table is really being
       * read for. A number on its own says how much somebody did; a distance
       * from the middle says whether that is a lot.
       */
      key: 'deviation',
      header: t('reports.deviation'),
      className: 'ltr-inline tabular-nums',
      cell: (row) => {
        const away = balance.deviation.get(row.personnelId) ?? 0;
        if (away === 0) return '0';
        return (
          <span className={away > 0 ? 'text-warning' : 'text-success'}>
            {away > 0 ? '+' : '−'}
            {formatHours(Math.abs(away))}
          </span>
        );
      },
    },
  ];

  return (
    <>
      <div className="no-print">
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
              <MenuButton
                label={t('reports.export')}
                actions={[
                  {
                    key: 'xlsx',
                    label: t('reports.exportExcel'),
                    hint: t('reports.exportExcelHint'),
                    icon: <FileSpreadsheet className="size-4" />,
                    disabled: rows.length === 0,
                    onSelect: exportExcel,
                  },
                  {
                    key: 'csv',
                    label: t('reports.exportCsv'),
                    icon: <Table className="size-4" />,
                    disabled: rows.length === 0,
                    onSelect: exportCsv,
                  },
                  {
                    key: 'print',
                    label: t('reports.exportPrint'),
                    hint: t('reports.exportPrintHint'),
                    icon: <Printer className="size-4" />,
                    disabled: rows.length === 0,
                    onSelect: () => window.print(),
                  },
                ]}
              />
            </>
          }
        />
      </div>

      <p className="print-title">
        {t('reports.printTitle', {
          from: formatDate(range.from),
          to: formatDate(range.to - 1),
        })}
      </p>

      <QueryState
        isLoading={report.isLoading}
        error={report.error}
        isEmpty={rows.length === 0}
        emptyDescription={t('reports.empty')}
        onRetry={() => void report.refetch()}
      >
        <div className="flex flex-col gap-4">
          <BalancePanel rows={rows} measure={measure} onMeasureChange={setMeasure} />

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
