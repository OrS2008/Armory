import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Pencil, Search, UserPlus } from 'lucide-react';
import type { Assignment } from '@shared/types';
import type { Conflict } from '@shared/conflicts';
import type { Candidate } from '@shared/candidates';
import { formatRange } from '@shared/format';
import { buildCrew, openSeatRoles } from '@shared/crew';
import { Permissions } from '@shared/rbac';
import { selectVisibleCandidates } from './candidateVisibility';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input } from '@/components/ui/Input';
import { MenuButton, type MenuAction } from '@/components/ui/MenuButton';
import { LoadingState } from '@/components/ui/States';
import { ConflictList } from '@/components/scheduling/ConflictList';
import { useToast } from '@/components/ui/toast-context';
import { Select } from '@/components/ui/Input';
import {
  queryKeys,
  useAssignPersonnel,
  useQualifications,
  useUnassignPersonnel,
} from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

interface Props {
  assignment: Assignment | null;
  conflicts: Conflict[];
  timezone: string;
  onClose: () => void;
  onEdit?: (assignment: Assignment) => void;
}

/** Cap on the ineligible tail shown alongside the (always fully shown) eligible candidates. */
const VISIBLE_CANDIDATES = 12;

export function AssignmentDetailDialog({
  assignment,
  conflicts,
  timezone,
  onClose,
  onEdit,
}: Props) {
  const { can } = useAuth();
  const toast = useToast();
  const assign = useAssignPersonnel();
  const unassign = useUnassignPersonnel();
  const [overrideFor, setOverrideFor] = useState<string | null>(null);
  const [overrideReason, setOverrideReason] = useState('');
  const [search, setSearch] = useState('');
  // Which seat the next assignment fills. Empty string is the plain לוחם seat,
  // which is also what the API reads as "no named role".
  const [seat, setSeat] = useState('');
  const qualifications = useQualifications();

  const candidates = useQuery({
    queryKey: queryKeys.candidates(assignment?.id ?? ''),
    queryFn: () =>
      api.get<{ candidates: Candidate[] }>(`/assignments/${assignment?.id ?? ''}/candidates`),
    enabled: Boolean(assignment) && can(Permissions.assignmentsAssign),
    select: (data) => data.candidates,
  });

  const all = useMemo(() => candidates.data ?? [], [candidates.data]);
  /*
   * "במועמדים המוצעים לשיבוץ, תן לי אפשרות לחפש את החייל שאני רוצה."
   *
   * The ranking answers "who should stand here"; the search answers "I already
   * know who, where is he". Both are legitimate, and a flat top-twelve list
   * could not serve either: with a plain seat, most of the roster is eligible,
   * so the cap silently dropped real candidates ranked 13th or lower — not
   * "hidden behind a search box", just gone, with nothing on screen to say a
   * search would even help. Eligible candidates are never capped now; only the
   * ineligible ones (kept for their explanation, not for picking) are, and
   * search still reaches the whole list regardless.
   */
  const filtered = useMemo(() => {
    const needle = search.trim().toLowerCase();
    if (!needle) return all;
    return all.filter((candidate) => candidate.displayName.toLowerCase().includes(needle));
  }, [all, search]);
  const shown = useMemo(() => selectVisibleCandidates(filtered, VISIBLE_CANDIDATES), [filtered]);

  if (!assignment) return null;

  const missing = assignment.requiredHeadcount - assignment.assignees.length;
  const qualificationName = (id: string) =>
    qualifications.data?.find((item) => item.id === id)?.name ?? id;
  const seats = buildCrew(assignment, qualificationName, assignment.crewRoleSuffix);
  const openSeats = openSeatRoles({
    requiredHeadcount: assignment.requiredHeadcount,
    requiredQualifications: assignment.requiredQualifications,
    assigneeIds: assignment.assignees.map((assignee) => assignee.personnelId),
    assigneeRoles: Object.fromEntries(
      assignment.assignees.map((assignee) => [assignee.personnelId, assignee.role]),
    ),
  });
  const namedOpenSeats = [...new Set(openSeats.filter((role): role is string => Boolean(role)))];
  // A seat that has since been taken must not stay selected: the server would
  // refuse the assignment for a reason the reader never chose.
  const chosenSeat = seat && namedOpenSeats.includes(seat) ? seat : '';

  const handleAssign = (personnelId: string, reason?: string) => {
    assign.mutate(
      {
        assignmentId: assignment.id,
        personnelId,
        role: chosenSeat || null,
        ...(reason ? { overrideReason: reason } : {}),
      },
      {
        onSuccess: (result) => {
          toast.push(
            'success',
            result.overridden ? t('schedule.overrideDone') : t('state.savedTitle'),
          );
          setOverrideFor(null);
          setOverrideReason('');
        },
        onError: (error) => {
          if (!(error instanceof ApiError)) {
            toast.push('error', t('state.errorBody'));
            return;
          }
          /*
           * A blocked assignment is a question, not a dead end.
           *
           * The first attempt comes back 409 with the rules that blocked it;
           * that is where the reason box opens. What used to happen after that
           * was silence — the reader typed a reason, pressed the button, and
           * got the same red toast with no way to tell whether the override was
           * refused, or their account simply may not override. Each of those
           * now says which it is.
           */
          if (error.code === 'SCHEDULING_CONFLICT') {
            setOverrideFor(personnelId);
            toast.push(
              'error',
              can(Permissions.assignmentsOverride)
                ? t('schedule.overrideBlocked')
                : t('schedule.overrideNoPermission'),
            );
            return;
          }
          if (error.code === 'OVERRIDE_NOT_ALLOWED') {
            setOverrideFor(null);
            toast.push('error', t('schedule.overrideNotAllowed'));
            return;
          }
          if (error.code === 'FORBIDDEN') {
            setOverrideFor(null);
            toast.push('error', t('schedule.overrideNoPermission'));
            return;
          }
          toast.push('error', error.message);
        },
      },
    );
  };

  const removeActions = (personnelId: string): MenuAction[] => [
    {
      key: 'shift',
      label: t('schedule.unassign'),
      onSelect: () =>
        unassign.mutate(
          { assignmentId: assignment.id, personnelId },
          {
            onSuccess: () => toast.push('success', t('schedule.unassignDone')),
            onError: (error) =>
              toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
          },
        ),
    },
    {
      key: 'day',
      label: t('schedule.unassignDay'),
      onSelect: () =>
        unassign.mutate(
          { assignmentId: assignment.id, personnelId, scope: 'day' },
          {
            onSuccess: (result) =>
              toast.push('success', t('schedule.unassignDayDone', { count: result.removed })),
            onError: (error) =>
              toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
          },
        ),
    },
  ];

  return (
    <Dialog
      open
      size="lg"
      title={assignment.title ?? assignment.assignmentTypeName}
      description={formatRange(assignment.startAt, assignment.endAt, timezone)}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.close')}
          </Button>
          {onEdit && can(Permissions.assignmentsWrite) ? (
            <Button
              variant="secondary"
              icon={<Pencil className="size-4" />}
              onClick={() => onEdit(assignment)}
            >
              {t('schedule.editAssignment')}
            </Button>
          ) : null}
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <section>
          <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold">
            {t('assignments.assigned')}
            <Badge tone={missing > 0 ? 'warning' : 'success'}>
              {assignment.assignees.length}/{assignment.requiredHeadcount}
            </Badge>
          </h3>
          {assignment.assignees.length === 0 && seats.length === 0 ? (
            <p className="text-sm text-ink-muted">{t('assignments.noAssignees')}</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {seats.map((crewSeat, index) => {
                const assignee = crewSeat.assignee;
                if (!assignee) {
                  return (
                    <li
                      key={`empty-${index}`}
                      className="flex items-center gap-2 rounded-[var(--radius-control)] border border-dashed border-border-strong px-3 py-2"
                    >
                      <span className="w-20 text-xs font-semibold text-ink-muted">
                        {crewSeat.label}
                      </span>
                      <span className="text-sm text-danger">{t('schedule.seatEmpty')}</span>
                    </li>
                  );
                }
                return (
                  <li
                    key={assignee.personnelId}
                    className="flex items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle px-3 py-2"
                  >
                    <span className="w-20 text-xs font-semibold text-ink-muted">
                      {crewSeat.label}
                    </span>
                    <span className="text-sm font-medium">{assignee.personnelName}</span>
                    {assignee.overrideReason ? (
                      <Badge tone="warning">{t('conflicts.override')}</Badge>
                    ) : null}
                    {assignee.acknowledgedAt ? (
                      <Badge tone="success">{t('assignments.acknowledged')}</Badge>
                    ) : null}
                    {can(Permissions.assignmentsAssign) ? (
                      <MenuButton
                        className="ms-auto"
                        label={t('schedule.unassign')}
                        ariaLabel={`${t('schedule.unassign')} — ${assignee.personnelName}`}
                        actions={removeActions(assignee.personnelId)}
                      />
                    ) : null}
                  </li>
                );
              })}
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
            {namedOpenSeats.length > 0 ? (
              <label className="mb-3 flex flex-wrap items-center gap-2 text-sm">
                {t('schedule.assignToSeat')}
                <Select
                  className="w-auto"
                  value={chosenSeat}
                  onChange={(event) => setSeat(event.target.value)}
                >
                  <option value="">{t('schedule.rolePlain')}</option>
                  {namedOpenSeats.map((role) => (
                    <option key={role} value={role}>
                      {qualificationName(role)}
                    </option>
                  ))}
                </Select>
              </label>
            ) : null}

            <label className="mb-2 flex items-center gap-2">
              <span className="sr-only">{t('schedule.candidateSearch')}</span>
              <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
              <Input
                type="search"
                value={search}
                placeholder={t('schedule.candidateSearchPlaceholder')}
                aria-label={t('schedule.candidateSearch')}
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            {candidates.isLoading ? <LoadingState /> : null}
            {!candidates.isLoading && all.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('assignments.noCandidates')}</p>
            ) : null}
            {!candidates.isLoading && all.length > 0 && filtered.length === 0 ? (
              <p className="text-sm text-ink-muted">{t('schedule.candidatesNoMatch')}</p>
            ) : null}
            {filtered.length > shown.length ? (
              <p className="mb-2 text-xs text-ink-faint">
                {t('schedule.candidatesShown', { shown: shown.length, total: filtered.length })}
              </p>
            ) : null}

            <ul className="flex flex-col gap-2">
              {shown.map((candidate) => (
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
                    {/* Somebody the rules block is not offered a button that
                        fails: pressing it opens the override, which is the only
                        way they can be assigned and the way that records why. */}
                    <Button
                      className="ms-auto"
                      size="sm"
                      variant={candidate.eligible ? 'primary' : 'secondary'}
                      icon={<UserPlus className="size-4" />}
                      loading={assign.isPending}
                      disabled={!candidate.eligible && !can(Permissions.assignmentsOverride)}
                      title={
                        !candidate.eligible && !can(Permissions.assignmentsOverride)
                          ? t('schedule.overrideNoPermission')
                          : undefined
                      }
                      onClick={() =>
                        candidate.eligible
                          ? handleAssign(candidate.personnelId)
                          : setOverrideFor(candidate.personnelId)
                      }
                    >
                      {candidate.eligible ? t('assignments.assign') : t('conflicts.override')}
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

                  {overrideFor === candidate.personnelId ? (
                    can(Permissions.assignmentsOverride) ? (
                      <div className="mt-2 flex flex-col gap-2 rounded-md bg-warning-soft p-2">
                        <label
                          className="text-xs font-medium text-warning"
                          htmlFor="override-reason"
                        >
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
                          loading={assign.isPending}
                          disabled={overrideReason.trim().length < 3}
                          onClick={() => handleAssign(candidate.personnelId, overrideReason.trim())}
                        >
                          {t('conflicts.override')}
                        </Button>
                      </div>
                    ) : (
                      <p className="mt-2 rounded-md bg-danger-soft p-2 text-xs text-danger">
                        {t('schedule.overrideNoPermission')}
                      </p>
                    )
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
