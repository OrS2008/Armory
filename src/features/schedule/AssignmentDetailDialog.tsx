import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { UserMinus, UserPlus } from 'lucide-react';
import type { Assignment } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import type { Candidate } from '@shared/candidates';
import { formatRange } from '@shared/format';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { LoadingState } from '@/components/ui/States';
import { ConflictList } from '@/components/scheduling/ConflictList';
import { useToast } from '@/components/ui/toast-context';
import { queryKeys, useAssignPersonnel, useUnassignPersonnel } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

interface Props {
  assignment: Assignment | null;
  conflicts: Conflict[];
  timezone: string;
  onClose: () => void;
}

export function AssignmentDetailDialog({ assignment, conflicts, timezone, onClose }: Props) {
  const { can } = useAuth();
  const toast = useToast();
  const assign = useAssignPersonnel();
  const unassign = useUnassignPersonnel();
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');

  const candidates = useQuery({
    queryKey: queryKeys.candidates(assignment?.id ?? ''),
    queryFn: () =>
      api.get<{ candidates: Candidate[] }>(`/assignments/${assignment?.id ?? ''}/candidates`),
    enabled: Boolean(assignment) && can(Permissions.assignmentsAssign),
    select: (data) => data.candidates,
  });

  if (!assignment) return null;

  const missing = assignment.requiredHeadcount - assignment.assignees.length;

  const handleAssign = (personnelId: string, reason?: string) => {
    assign.mutate(
      { assignmentId: assignment.id, personnelId, ...(reason ? { overrideReason: reason } : {}) },
      {
        onSuccess: () => {
          toast.push('success', t('state.savedTitle'));
          setOverrideFor(null);
          setOverrideReason('');
        },
        onError: (error) => {
          if (error instanceof ApiError && error.code === 'SCHEDULING_CONFLICT') {
            setOverrideFor(personnelId);
          }
          toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));
        },
      },
    );
  };

  return (
    <Dialog
      open
      size="lg"
      title={assignment.title ?? assignment.assignmentTypeName}
      description={formatRange(assignment.startAt, assignment.endAt, timezone)}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('app.close')}
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {t('assignments.assigned')}
            <Badge tone={missing > 0 ? 'warning' : 'success'}>
              {assignment.assignees.length}/{assignment.requiredHeadcount}
            </Badge>
            <Badge tone={assignment.publicationState === 'published' ? 'success' : 'neutral'}>
              {assignment.publicationState === 'published'
                ? t('schedule.publishedState')
                : assignment.publicationState === 'modified'
                  ? t('schedule.modified')
                  : t('schedule.draft')}
            </Badge>
          </h3>
          {assignment.assignees.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('assignments.noAssignees')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {assignment.assignees.map((assignee) => (
                <li
                  key={assignee.personnelId}
                  className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle px-3 py-2"
                >
                  <span className="text-sm font-medium">{assignee.personnelName}</span>
                  {assignee.overrideReason ? (
                    <Badge tone="warning">{t('conflicts.override')}</Badge>
                  ) : null}
                  {assignee.acknowledgedAt ? (
                    <Badge tone="success">{t('assignments.acknowledged')}</Badge>
                  ) : null}
                  {can(Permissions.assignmentsAssign) ? (
                    <Button
                      className="ms-auto"
                      variant="ghost"
                      size="sm"
                      icon={<UserMinus className="size-4" />}
                      loading={unassign.isPending}
                      onClick={() =>
                        unassign.mutate({
                          assignmentId: assignment.id,
                          personnelId: assignee.personnelId,
                        })
                      }
                    >
                      {t('schedule.unassign')}
                    </Button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        {conflicts.length > 0 ? (
          <section>
            <h3 className="mb-2 text-sm font-semibold">{t('conflicts.title')}</h3>
            <ConflictList conflicts={conflicts} />
          </section>
        ) : null}

        {can(Permissions.assignmentsAssign) ? (
          <section>
            <h3 className="text-sm font-semibold">{t('assignments.candidates')}</h3>
            <p className="mb-2 text-xs text-ink-muted">{t('assignments.candidatesHint')}</p>
            {candidates.isLoading ? <LoadingState /> : null}
            {!candidates.isLoading && (candidates.data ?? []).length === 0 ? (
              <p className="text-sm text-ink-muted">{t('assignments.noCandidates')}</p>
            ) : null}
            <ul className="flex flex-col gap-2">
              {(candidates.data ?? []).slice(0, 12).map((candidate) => (
                <li
                  key={candidate.personnelId}
                  className="rounded-[var(--radius-control)] border border-border-subtle p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{candidate.displayName}</span>
                    <Badge tone={candidate.eligible ? 'success' : 'danger'}>
                      {candidate.eligible ? t('assignments.eligible') : t('assignments.ineligible')}
                    </Badge>
                    <span className="text-xs text-ink-faint">
                      {t('assignments.score', { score: candidate.score })}
                    </span>
                    <Button
                      className="ms-auto"
                      size="sm"
                      variant={candidate.eligible ? 'primary' : 'secondary'}
                      icon={<UserPlus className="size-4" />}
                      loading={assign.isPending}
                      onClick={() => handleAssign(candidate.personnelId)}
                    >
                      {t('assignments.assign')}
                    </Button>
                  </div>

                  <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-ink-muted">
                    {candidate.reasons.map((reason) => (
                      <li key={reason}>{reason}</li>
                    ))}
                  </ul>

                  {candidate.blockers.map((blocker) => (
                    <p key={blocker} className="mt-1 text-xs text-danger">
                      {blocker}
                    </p>
                  ))}
                  {candidate.warnings.map((warning) => (
                    <p key={warning} className="mt-1 text-xs text-warning">
                      {warning}
                    </p>
                  ))}

                  {overrideFor === candidate.personnelId && can(Permissions.assignmentsOverride) ? (
                    <div className="mt-2 flex flex-col gap-2 rounded-md bg-warning-soft p-2">
                      <label className="text-xs font-medium text-warning" htmlFor="override-reason">
                        {t('conflicts.overrideRequired')}
                      </label>
                      <Input
                        id="override-reason"
                        value={overrideReason}
                        onChange={(event) => setOverrideReason(event.target.value)}
                        placeholder={t('conflicts.overrideReason')}
                      />
                      <Button
                        size="sm"
                        variant="danger"
                        disabled={overrideReason.trim().length < 3}
                        onClick={() => handleAssign(candidate.personnelId, overrideReason.trim())}
                      >
                        {t('conflicts.override')}
                      </Button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
