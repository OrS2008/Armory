import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock } from 'lucide-react';
import { buildCrew } from '@shared/crew';
import { formatCountdown, formatRange } from '@shared/format';
import type { Assignment } from '@shared/types';
import { t } from '@/i18n';
import { Badge } from '@/components/ui/Badge';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { useQualifications } from '@/hooks/queries';

/**
 * Who is at a gate at this minute.
 *
 * The counters above answer "how is today shaped". A duty officer walks in
 * with a different question, and the sheet makes them work it out by reading a
 * column of times against the clock on the wall. A post standing empty right
 * now is listed too, because an uncovered post is the reason to look at all.
 */
export function OnDutyNow({
  assignments,
  timezone,
}: {
  assignments: Assignment[];
  timezone: string;
}) {
  const qualifications = useQualifications();
  // The dashboard itself refreshes on the minute; the countdown has to move in
  // between, and a shift that has ended should leave the list when it ends
  // rather than when the next fetch notices.
  const [at, setAt] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setAt(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const names = new Map((qualifications.data ?? []).map((one) => [one.id, one.name]));
  const qualificationName = (id: string) => names.get(id) ?? id;
  const current = assignments.filter((assignment) => assignment.endAt > at);

  return (
    <Card>
      <CardHeader
        title={t('dashboard.onDuty')}
        description={t('dashboard.onDutyHint')}
        action={
          <Link className="text-sm text-brand-700 hover:underline" to="/schedule">
            {t('schedule.title')}
          </Link>
        }
      />
      {current.length === 0 ? (
        <EmptyState description={t('dashboard.noneOnDuty')} />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {current.map((assignment) => {
            const seats = buildCrew(assignment, qualificationName, assignment.crewRoleSuffix);
            const missing = assignment.requiredHeadcount - assignment.assignees.length;
            return (
              <li
                key={assignment.id}
                className="rounded-[var(--radius-control)] border border-border-subtle p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {assignment.title ?? assignment.sheetLabel ?? assignment.assignmentTypeName}
                  </span>
                  <Badge
                    tone={assignment.endAt - at <= 30 * 60_000 ? 'warning' : 'neutral'}
                    icon={<Clock className="size-3" />}
                  >
                    {t('dashboard.handoverIn', { time: formatCountdown(assignment.endAt - at) })}
                  </Badge>
                </div>
                <p className="ltr-inline mt-0.5 text-xs text-ink-muted">
                  {formatRange(assignment.startAt, assignment.endAt, timezone)}
                </p>
                <ul className="mt-2 flex flex-col gap-1 text-sm">
                  {seats.map((seat, index) => (
                    <li
                      key={`${seat.roleQualificationId ?? 'plain'}-${index}`}
                      className="flex gap-2"
                    >
                      <span className="w-20 shrink-0 truncate text-xs text-ink-faint">
                        {seat.label}
                      </span>
                      <span className={seat.assignee ? '' : 'text-warning'}>
                        {seat.assignee?.personnelName ?? t('dashboard.seatEmpty')}
                      </span>
                    </li>
                  ))}
                </ul>
                {missing > 0 ? (
                  <p className="mt-2">
                    <Badge tone="warning" icon={<AlertTriangle className="size-3" />}>
                      {missing === 1
                        ? t('schedule.missingOne')
                        : t('schedule.missingPerson', { count: missing })}
                    </Badge>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
