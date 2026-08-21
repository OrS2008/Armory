import { useMemo, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Sparkles, X } from 'lucide-react';
import { buildAutofillProposal, type ProposedAssignment } from '@shared/autofill';
import type { EngineAbsence, EngineAssignment, EnginePerson } from '@shared/conflicts';
import type { Assignment, Availability, Personnel, Qualification } from '@shared/types';
import type { SchedulingRule } from '@shared/conflicts';
import { formatHours, formatRange } from '@shared/format';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { IconButton } from '@/components/ui/IconButton';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useScheduleInvalidation } from '@/hooks/queries';

interface Props {
  open: boolean;
  onClose: () => void;
  assignments: Assignment[];
  personnel: Personnel[];
  availability: Availability[];
  qualifications: Qualification[];
  rules: SchedulingRule[];
  timezone: string;
}

const toEngineAssignment = (assignment: Assignment): EngineAssignment => ({
  id: assignment.id,
  assignmentTypeId: assignment.assignmentTypeId,
  title: assignment.title ?? assignment.assignmentTypeName,
  startAt: assignment.startAt,
  endAt: assignment.endAt,
  requiredHeadcount: assignment.requiredHeadcount,
  requiredQualifications: assignment.requiredQualifications,
  assigneeIds: assignment.assignees.map((assignee) => assignee.personnelId),
  assigneeRoles: Object.fromEntries(
    assignment.assignees.map((assignee) => [assignee.personnelId, assignee.role]),
  ),
  publicationState: assignment.publicationState,
  cancelled: assignment.status === 'cancelled',
});

const toEnginePerson = (person: Personnel): EnginePerson => ({
  id: person.id,
  displayName: person.displayName,
  qualificationIds: person.qualificationIds,
});

const toAbsences = (availability: Availability[]): EngineAbsence[] =>
  availability
    .filter((entry) => entry.status === 'approved' && entry.kind !== 'available')
    .map((entry) => ({
      personnelId: entry.personnelId,
      kind: entry.kind,
      startAt: entry.startAt,
      endAt: entry.endAt,
    }));

/**
 * The proposal is computed in the browser from data already on screen, using
 * the same engine the server enforces. That keeps a whole week's worth of
 * ranking off the request CPU budget, and the server re-validates everything
 * before writing, so the client is a convenience and never the authority.
 */
export function AutofillDialog({
  open,
  onClose,
  assignments,
  personnel,
  availability,
  qualifications,
  rules,
  timezone,
}: Props) {
  const toast = useToast();
  const invalidate = useScheduleInvalidation();
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  const proposal = useMemo(() => {
    if (!open) return null;
    return buildAutofillProposal({
      assignments: assignments.map(toEngineAssignment),
      personnel: personnel.filter((person) => person.status === 'active').map(toEnginePerson),
      absences: toAbsences(availability),
      rules,
      qualificationNames: Object.fromEntries(
        qualifications.map((qualification) => [qualification.id, qualification.name]),
      ),
      exclusiveQualificationIds: qualifications
        .filter((qualification) => qualification.exclusive)
        .map((qualification) => qualification.id),
      timezone,
    });
  }, [open, assignments, personnel, availability, qualifications, rules, timezone]);

  // The limit the demand is measured against, in hours.
  const continuousLimitHours =
    (rules.find((rule) => rule.code === 'MAX_CONTINUOUS')?.config.minutes ?? 0) / 60 || Infinity;

  const key = (item: ProposedAssignment) => `${item.assignmentId}:${item.personnelId}`;
  const accepted = (proposal?.proposed ?? []).filter((item) => !dropped.has(key(item)));

  const apply = useMutation({
    mutationFn: () =>
      api.post<{ applied: number; rejected: { reason: string }[] }>('/assignments/bulk-assign', {
        assignments: accepted.map((item) => ({
          assignmentId: item.assignmentId,
          personnelId: item.personnelId,
          role: item.role,
        })),
      }),
    onSuccess: (result) => {
      invalidate();
      toast.push('success', t('schedule.autofillApplied', { count: result.applied }));
      if (result.rejected.length > 0) {
        toast.push('error', t('schedule.autofillRejected', { count: result.rejected.length }));
      }
      setDropped(new Set());
      onClose();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const byAssignment = new Map<string, ProposedAssignment[]>();
  for (const item of accepted) {
    byAssignment.set(item.assignmentId, [...(byAssignment.get(item.assignmentId) ?? []), item]);
  }

  return (
    <Dialog
      open={open}
      size="lg"
      title={t('schedule.autofillTitle')}
      description={t('schedule.autofillSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            icon={<Sparkles className="size-4" />}
            disabled={accepted.length === 0}
            loading={apply.isPending}
            onClick={() => apply.mutate()}
          >
            {t('schedule.autofillApply', { count: accepted.length })}
          </Button>
        </>
      }
    >
      {!proposal || (proposal.proposed.length === 0 && proposal.gaps.length === 0) ? (
        <EmptyState description={t('schedule.autofillEmpty')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-2">
            <Badge tone="brand">{t('schedule.autofillProposed', { count: accepted.length })}</Badge>
            {proposal.gaps.length > 0 ? (
              <Badge tone="warning">
                {t('schedule.autofillGaps', {
                  count: proposal.gaps.reduce((total, gap) => total + gap.missing, 0),
                })}
              </Badge>
            ) : null}
          </div>

          <ul className="flex flex-col gap-3">
            {[...byAssignment.entries()].map(([assignmentId, items]) => {
              const assignment = assignments.find((item) => item.id === assignmentId);
              return (
                <li
                  key={assignmentId}
                  className="rounded-[var(--radius-control)] border border-border-subtle p-3"
                >
                  <p className="font-medium">
                    {assignment?.title ?? assignment?.assignmentTypeName ?? assignmentId}
                  </p>
                  {assignment ? (
                    <p className="ltr-inline text-xs text-ink-muted">
                      {formatRange(assignment.startAt, assignment.endAt, timezone)}
                    </p>
                  ) : null}
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {items.map((item) => (
                      <li key={key(item)} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="w-16 text-xs font-semibold text-ink-muted">
                          {item.roleLabel}
                        </span>
                        <span className="font-medium">{item.displayName}</span>
                        <span className="text-xs text-ink-muted">{item.reasons.join(' · ')}</span>
                        {item.warnings.map((warning) => (
                          <span key={warning} className="text-xs text-warning">
                            {warning}
                          </span>
                        ))}
                        <IconButton
                          className="ms-auto"
                          label={t('schedule.autofillRemove')}
                          icon={<X className="size-4" />}
                          onClick={() => setDropped(new Set(dropped).add(key(item)))}
                        />
                      </li>
                    ))}
                  </ul>
                </li>
              );
            })}
          </ul>

          {proposal.gaps.length > 0 ? (
            <section>
              <h3 className="mb-1.5 text-sm font-semibold text-warning">
                {t('schedule.autofillGaps', {
                  count: proposal.gaps.reduce((total, gap) => total + gap.missing, 0),
                })}
              </h3>

              {/* When the seats outnumber the roster, the gap list is a symptom
                  and the arithmetic is the answer. */}
              <p className="mb-2 rounded-[var(--radius-control)] bg-surface-sunken p-2 text-xs text-ink-muted">
                {t('schedule.demand', {
                  hours: formatHours(proposal.demand.seatHours),
                  people: proposal.demand.people,
                  perPerson: formatHours(proposal.demand.hoursPerPerson),
                })}
                {proposal.demand.hoursPerPerson > continuousLimitHours ? (
                  <span className="mt-1 block font-medium text-warning">
                    {t('schedule.demandOverLimit')}
                  </span>
                ) : null}
              </p>
              <ul className="flex flex-col gap-1 text-sm text-ink-muted">
                {proposal.gaps.map((gap) => (
                  <li key={gap.assignmentId}>
                    {gap.assignmentTitle} — {t('schedule.missingPerson', { count: gap.missing })}:{' '}
                    {gap.reason}
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      )}
    </Dialog>
  );
}
