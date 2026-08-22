import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarPlus, Users } from 'lucide-react';
import { formatDateTime, formatDayKey, formatRange, weekdayName } from '@shared/format';
import { severityLabels } from '@shared/messages.he';
import { t } from '@/i18n';
import { Badge } from '@/components/ui/Badge';
import { severityTone } from '@/components/ui/badge-tones';
import { Card, CardHeader, MetricCard } from '@/components/ui/Card';
import { buttonClass } from '@/components/ui/button-styles';
import { EmptyState, QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { useDashboard } from '@/hooks/queries';
import { SetupChecklist } from './SetupChecklist';

export function DashboardPage() {
  const dashboard = useDashboard();
  const data = dashboard.data;
  const issues = data ? data.conflictSummary.blocking + data.conflictSummary.warning : 0;

  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        description={
          <>
            {data ? (
              <span className="ltr-inline block font-medium text-ink">
                יום {weekdayName(data.date)} · {formatDayKey(data.date)}
              </span>
            ) : null}
            {t('dashboard.subtitle')}
          </>
        }
        actions={
          <>
            <Link to="/personnel" className={buttonClass('secondary', 'sm')}>
              <Users className="size-4" aria-hidden />
              {t('nav.personnel')}
            </Link>
            <Link to="/schedule" className={buttonClass('primary', 'sm')}>
              <CalendarPlus className="size-4" aria-hidden />
              {t('schedule.newAssignment')}
            </Link>
          </>
        }
      />

      <QueryState
        isLoading={dashboard.isLoading}
        error={dashboard.error}
        onRetry={() => void dashboard.refetch()}
      >
        {data ? (
          <div className="flex flex-col gap-4">
            <SetupChecklist />

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <MetricCard
                label={t('dashboard.available')}
                value={data.stats.availableCount}
                hint={t('dashboard.ofPersonnel', { count: data.stats.personnelCount })}
                tone="success"
              />
              <MetricCard
                label={t('dashboard.assigned')}
                value={data.stats.assignedCount}
                hint={`${t('dashboard.unavailable')}: ${data.stats.unavailableCount}`}
              />
              <MetricCard
                label={t('dashboard.issues')}
                value={issues}
                hint={`${t('conflicts.blocking')}: ${data.conflictSummary.blocking}`}
                tone={
                  data.conflictSummary.blocking > 0 ? 'danger' : issues > 0 ? 'warning' : 'neutral'
                }
              />
              {/* There is no publication step to be behind on, so the number
                  that matters is how many seats are still empty today. */}
              <MetricCard
                label={t('dashboard.openSeats')}
                value={data.stats.openSeatCount}
                hint={`${t('dashboard.understaffed')}: ${data.stats.understaffedCount}`}
                tone={data.stats.openSeatCount > 0 ? 'warning' : 'success'}
              />
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              <Card>
                <CardHeader
                  title={t('dashboard.upcoming')}
                  action={
                    <Link className="text-sm text-brand-700 hover:underline" to="/schedule">
                      {t('schedule.title')}
                    </Link>
                  }
                />
                {data.upcoming.length === 0 ? (
                  <EmptyState description={t('dashboard.noUpcoming')} />
                ) : (
                  <ul className="flex flex-col divide-y divide-border-subtle">
                    {data.upcoming.map((assignment) => {
                      const missing = assignment.requiredHeadcount - assignment.assignees.length;
                      return (
                        <li key={assignment.id} className="flex items-center gap-3 py-2.5">
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">
                              {assignment.title ?? assignment.assignmentTypeName}
                            </p>
                            <p className="ltr-inline text-xs text-ink-muted">
                              {formatRange(assignment.startAt, assignment.endAt, data.timezone)}
                            </p>
                          </div>
                          {missing > 0 ? (
                            <Badge tone="warning" icon={<AlertTriangle className="size-3" />}>
                              {missing === 1
                                ? t('schedule.missingOne')
                                : t('schedule.missingPerson', { count: missing })}
                            </Badge>
                          ) : (
                            <Badge tone="success">
                              {assignment.assignees.length}/{assignment.requiredHeadcount}
                            </Badge>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </Card>

              <Card>
                <CardHeader
                  title={t('dashboard.alerts')}
                  action={
                    <Link
                      className="text-sm text-brand-700 hover:underline"
                      to="/schedule/conflicts"
                    >
                      {t('conflicts.title')}
                    </Link>
                  }
                />
                {data.conflicts.length === 0 ? (
                  <EmptyState description={t('dashboard.noIssues')} />
                ) : (
                  <ul className="flex flex-col gap-2">
                    {data.conflicts.map((conflict) => (
                      <li
                        key={conflict.id}
                        className="rounded-[var(--radius-control)] border border-border-subtle p-3"
                      >
                        <div className="mb-1 flex items-center gap-2">
                          <Badge tone={severityTone[conflict.severity]}>
                            {severityLabels[conflict.severity]}
                          </Badge>
                          <span className="text-sm font-medium">{conflict.subject}</span>
                        </div>
                        <p className="text-sm text-ink-muted">{conflict.message}</p>
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>

            {data.recentChanges.length > 0 ? (
              <Card>
                <CardHeader title={t('dashboard.recentChanges')} />
                <ul className="flex flex-col divide-y divide-border-subtle text-sm">
                  {data.recentChanges.map((change) => (
                    <li key={change.id} className="flex flex-wrap items-center gap-2 py-2">
                      <span className="font-medium">{change.actorName}</span>
                      <span className="text-ink-muted">{change.action}</span>
                      <span className="ltr-inline ms-auto text-xs text-ink-faint">
                        {formatDateTime(change.createdAt, data.timezone)}
                      </span>
                    </li>
                  ))}
                </ul>
              </Card>
            ) : null}
          </div>
        ) : null}
      </QueryState>
    </>
  );
}
