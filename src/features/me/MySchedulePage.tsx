import { useMutation } from '@tanstack/react-query';
import { BadgeCheck, Repeat2 } from 'lucide-react';
import { availabilityKindLabels } from '@shared/messages.he';
import { formatRange, weekdayName } from '@shared/format';
import { dayKey } from '@shared/time';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState, QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { useMySchedule } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

export function MySchedulePage() {
  const { user } = useAuth();
  const toast = useToast();
  /*
   * An account that is not a soldier has no personal schedule, and the endpoint
   * says so with a 404 — which arrived on screen as "הפריט המבוקש לא נמצא", a
   * dead end for every administrator who opened this page. Not asking is the
   * honest version.
   */
  const linked = Boolean(user?.personnelId);
  const schedule = useMySchedule(linked);
  const timezone = schedule.data?.timezone ?? 'Asia/Jerusalem';
  const assignments = schedule.data?.assignments ?? [];

  const acknowledge = useMutation({
    mutationFn: (assignmentId: string) => api.post(`/assignments/${assignmentId}/acknowledge`),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void schedule.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const requestReplacement = useMutation({
    mutationFn: (assignmentId: string) =>
      api.post('/replacements', {
        assignmentId,
        personnelId: user?.personnelId ?? '',
        reason: null,
      }),
    onSuccess: () => toast.push('success', t('state.savedTitle')),
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  return (
    <>
      <PageHeader title={t('me.title')} description={t('me.subtitle')} />

      {!linked ? <EmptyState description={t('me.notLinked')} /> : null}

      {linked ? (
        <QueryState
          isLoading={schedule.isLoading}
          error={schedule.error}
          onRetry={() => void schedule.refetch()}
        >
          <div className="flex flex-col gap-4">
            <Card>
              <CardHeader title={t('me.upcoming')} />
              {assignments.length === 0 ? (
                <p className="py-6 text-center text-sm text-ink-muted">{t('me.noAssignments')}</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {assignments.map((assignment) => {
                    const mine = assignment.assignees[0];
                    return (
                      <li
                        key={assignment.id}
                        className="rounded-[var(--radius-control)] border border-border-subtle p-3"
                      >
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium">
                            {assignment.title ?? assignment.assignmentTypeName}
                          </span>
                          <Badge
                            tone={
                              assignment.publicationState === 'modified' ? 'warning' : 'neutral'
                            }
                          >
                            {weekdayName(dayKey(assignment.startAt, timezone))}
                          </Badge>
                          {mine?.acknowledgedAt ? (
                            <Badge tone="success">{t('assignments.acknowledged')}</Badge>
                          ) : null}
                        </div>
                        <p className="ltr-inline mt-1 text-sm text-ink-muted">
                          {formatRange(assignment.startAt, assignment.endAt, timezone)}
                        </p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {!mine?.acknowledgedAt ? (
                            <Button
                              size="sm"
                              variant="secondary"
                              icon={<BadgeCheck className="size-4" />}
                              loading={acknowledge.isPending}
                              onClick={() => acknowledge.mutate(assignment.id)}
                            >
                              {t('assignments.acknowledge')}
                            </Button>
                          ) : null}
                          <Button
                            size="sm"
                            variant="ghost"
                            icon={<Repeat2 className="size-4" />}
                            loading={requestReplacement.isPending}
                            onClick={() => requestReplacement.mutate(assignment.id)}
                          >
                            {t('replacements.request')}
                          </Button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader title={t('me.myAvailability')} />
              <ul className="flex flex-col divide-y divide-border-subtle text-sm">
                {(schedule.data?.availability ?? []).map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span>{availabilityKindLabels[entry.kind]}</span>
                    <span className="ltr-inline text-xs text-ink-muted">
                      {formatRange(entry.startAt, entry.endAt, timezone)}
                    </span>
                    <Badge
                      className="ms-auto"
                      tone={entry.status === 'approved' ? 'success' : 'warning'}
                    >
                      {entry.status === 'approved'
                        ? t('availability.approved')
                        : t('availability.pending')}
                    </Badge>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </QueryState>
      ) : null}
    </>
  );
}
