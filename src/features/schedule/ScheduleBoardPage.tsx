import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Printer,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { formatDayKey, weekdayName } from '@shared/format';
import { Permissions } from '@shared/rbac';
import { addDays, endOfDay, startOfDay, weekDays } from '@shared/time';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { todayKey } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Select } from '@/components/ui/Input';
import { MenuButton, type MenuAction } from '@/components/ui/MenuButton';
import { QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { StepsHint } from '@/components/layout/StepsHint';
import { DayTimeline } from '@/components/scheduling/DayTimeline';
import { RosterBoard } from '@/components/scheduling/RosterBoard';
import { PersonnelTimeline } from '@/components/scheduling/PersonnelTimeline';
import { WeekGrid } from '@/components/scheduling/WeekGrid';
import {
  useAssignments,
  usePersonnel,
  useQualifications,
  useRules,
  useUnits,
} from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';
import { AssignmentDetailDialog } from './AssignmentDetailDialog';
import { AssignmentEditDialog } from './AssignmentEditDialog';
import { AssignmentFormDialog } from './AssignmentFormDialog';
import { AutofillDialog } from './AutofillDialog';
import { StandingRosterDialog } from './StandingRosterDialog';

type View = 'roster' | 'day' | 'week' | 'personnel';

export function ScheduleBoardPage() {
  const { can } = useAuth();

  // The roster is the sheet people actually read, so it opens first; the
  // timeline stays a click away for the 'what is happening at 14:00' question.
  const [view, setView] = useState<View>('roster');
  const [day, setDay] = useState(() => todayKey());
  const [unitId, setUnitId] = useState('');
  const [creating, setCreating] = useState(false);
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [autofilling, setAutofilling] = useState(false);
  const [layingOut, setLayingOut] = useState(false);

  const units = useUnits();
  // Auto-fill judges people against the whole roster, so the unit filter
  // narrows what is *shown* and never who may be considered. Filtering the
  // fetch instead is how a post came to be told there were no drivers when the
  // drivers were simply in another platoon.
  const personnel = usePersonnel();
  const qualifications = useQualifications();
  const rules = useRules();

  const days = useMemo(() => weekDays(day), [day]);
  const boardWindow = useMemo(() => {
    const first = view === 'week' ? (days[0] ?? day) : day;
    const last = view === 'week' ? (days[6] ?? day) : day;
    return {
      from: startOfDay(first),
      to: endOfDay(last),
      ...(unitId ? { unitId } : {}),
    };
  }, [view, days, day, unitId]);

  const board = useAssignments(boardWindow);
  const timezone = board.data?.timezone ?? 'Asia/Jerusalem';
  const assignments = board.data?.assignments ?? [];
  const conflicts = board.data?.conflicts ?? [];
  const blockingCount = conflicts.filter((conflict) => conflict.severity === 'blocking').length;
  const openAssignment = assignments.find((item) => item.id === openAssignmentId) ?? null;
  const editingAssignment = assignments.find((item) => item.id === editingId) ?? null;
  const shownPersonnel = (personnel.data ?? []).filter(
    (person) => !unitId || person.unitId === unitId,
  );

  const seatsNeeded = assignments.reduce((total, item) => total + item.requiredHeadcount, 0);
  const seatsFilled = assignments.reduce(
    // A crew can be over-filled by hand; counting the extras as "staffed" would
    // let one full post hide an empty one in the totals.
    (total, item) => total + Math.min(item.assignees.length, item.requiredHeadcount),
    0,
  );
  const seatsMissing = seatsNeeded - seatsFilled;

  const shift = (direction: -1 | 1) =>
    setDay((current) => addDays(current, view === 'week' ? 7 * direction : direction));

  /*
   * The sheet goes out as a PDF in the group chat, so there is no publication
   * step to press — exporting it *is* the act of publishing. The board keeps
   * one overflow menu anyway, for the actions that are real but rare.
   */
  const menuActions: MenuAction[] = [
    {
      key: 'print',
      label: t('schedule.print'),
      hint: t('schedule.printHint'),
      icon: <Printer className="size-4" />,
      onSelect: () => window.print(),
    },
    ...(can(Permissions.assignmentsWrite)
      ? [
          {
            key: 'standing',
            label: t('schedule.standing'),
            hint: t('schedule.standingSubtitle'),
            icon: <CalendarRange className="size-4" />,
            onSelect: () => setLayingOut(true),
          },
        ]
      : []),
  ];

  return (
    <>
      <div className="no-print">
        <PageHeader
          title={t('schedule.title')}
          description={t('schedule.subtitle')}
          actions={
            <>
              <MenuButton label={t('app.more')} actions={menuActions} />

              {can(Permissions.assignmentsAssign) ? (
                <Button
                  variant="secondary"
                  size="sm"
                  icon={<Sparkles className="size-4" />}
                  disabled={assignments.length === 0}
                  title={
                    assignments.length === 0 ? t('schedule.autofillNeedsAssignments') : undefined
                  }
                  onClick={() => setAutofilling(true)}
                >
                  {t('schedule.autofill')}
                </Button>
              ) : null}

              {can(Permissions.assignmentsWrite) ? (
                <Button
                  size="sm"
                  icon={<CalendarPlus className="size-4" />}
                  onClick={() => setCreating(true)}
                >
                  {t('schedule.newAssignment')}
                </Button>
              ) : null}
            </>
          }
        />

        {assignments.length === 0 && !board.isLoading ? (
          <>
            <StepsHint steps={[t('schedule.step1'), t('schedule.step2'), t('schedule.step3')]} />
            {can(Permissions.assignmentsWrite) ? (
              <Button
                className="mb-3"
                size="sm"
                icon={<CalendarRange className="size-4" />}
                onClick={() => setLayingOut(true)}
              >
                {t('schedule.standing')}
              </Button>
            ) : null}
          </>
        ) : null}

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <div className="flex shrink-0 items-center gap-0.5 rounded-[var(--radius-control)] border border-border-subtle bg-surface-raised p-0.5">
            <IconButton
              className="size-8"
              label={t('schedule.previousDay')}
              icon={<ChevronRight className="size-4" />}
              onClick={() => shift(-1)}
            />
            <button
              type="button"
              title={t('app.today')}
              onClick={() => setDay(todayKey())}
              className="whitespace-nowrap px-2 text-sm font-medium hover:underline"
            >
              <span className="ltr-inline">{formatDayKey(day)}</span>
              <span className="text-ink-muted"> · {weekdayName(day)}</span>
            </button>
            <IconButton
              className="size-8"
              label={t('schedule.nextDay')}
              icon={<ChevronLeft className="size-4" />}
              onClick={() => shift(1)}
            />
          </div>

          <div
            role="tablist"
            aria-label={t('schedule.view')}
            className="flex shrink-0 items-center gap-1 rounded-[var(--radius-control)] bg-surface-sunken p-0.5"
          >
            {(['roster', 'day', 'week', 'personnel'] as const).map((option) => (
              <button
                key={option}
                type="button"
                role="tab"
                aria-selected={view === option}
                onClick={() => setView(option)}
                className={cn(
                  'whitespace-nowrap rounded-md px-2.5 py-1 text-sm font-medium transition-colors',
                  view === option ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted',
                )}
              >
                {option === 'roster' || option === 'personnel' ? (
                  <>
                    {/* The long name explains the view; the short one fits the
                        four tabs beside the date picker on a phone. */}
                    <span className="sm:hidden">
                      {option === 'roster'
                        ? t('schedule.rosterShort')
                        : t('schedule.byPersonnelShort')}
                    </span>
                    <span className="hidden sm:inline">
                      {option === 'roster' ? t('schedule.roster') : t('schedule.byPersonnel')}
                    </span>
                  </>
                ) : option === 'day' ? (
                  t('schedule.day')
                ) : (
                  t('schedule.week')
                )}
              </button>
            ))}
          </div>

          <label className="flex shrink-0 items-center gap-1.5 text-sm text-ink-muted">
            {t('personnel.unit')}
            <Select
              className="w-auto"
              value={unitId}
              onChange={(event) => setUnitId(event.target.value)}
            >
              <option value="">{t('assignments.anyUnit')}</option>
              {(units.data ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          </label>
        </div>

        {assignments.length > 0 ? (
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
            <span className="font-medium">
              {t('schedule.summaryTasks', { count: assignments.length })}
            </span>
            <span aria-hidden className="text-ink-faint">
              ·
            </span>
            <span className={seatsMissing > 0 ? 'text-warning' : 'text-success'}>
              {seatsMissing > 0
                ? t('schedule.summaryMissing', { count: seatsMissing })
                : t('schedule.summaryFull')}
              <span className="ltr-inline ms-1 text-ink-muted">
                ({seatsFilled}/{seatsNeeded})
              </span>
            </span>
            <span aria-hidden className="text-ink-faint">
              ·
            </span>
            {conflicts.length > 0 ? (
              <Link
                to="/schedule/conflicts"
                className={cn(
                  'inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-2 py-0.5 font-medium',
                  blockingCount > 0
                    ? 'bg-danger-soft text-danger'
                    : 'text-ink-muted hover:underline',
                )}
              >
                <TriangleAlert className="size-4" aria-hidden />
                {t('schedule.summaryConflicts', { count: conflicts.length })}
              </Link>
            ) : (
              <span className="text-ink-muted">{t('schedule.summaryNoConflicts')}</span>
            )}
          </div>
        ) : null}
      </div>

      <p className="print-title">
        {t('schedule.sheetTitle', { date: formatDayKey(day), weekday: weekdayName(day) })}
      </p>

      <div
        className={cn(
          view === 'roster' ? '' : 'print-plain',
          'card p-3 sm:p-4 print:border-0 print:p-0 print:shadow-none',
        )}
      >
        <QueryState
          isLoading={board.isLoading}
          error={board.error}
          onRetry={() => void board.refetch()}
        >
          {view === 'roster' ? (
            <RosterBoard
              assignments={assignments}
              conflicts={conflicts}
              qualifications={qualifications.data ?? []}
              timezone={timezone}
              onOpen={setOpenAssignmentId}
            />
          ) : null}
          {/* Whatever is on screen, the PDF is the duty sheet. */}
          {view === 'roster' ? null : (
            <div className="print-only">
              <RosterBoard
                assignments={assignments}
                conflicts={conflicts}
                qualifications={qualifications.data ?? []}
                timezone={timezone}
                onOpen={setOpenAssignmentId}
              />
            </div>
          )}
          {view === 'day' ? (
            <DayTimeline
              dayKey={day}
              timezone={timezone}
              assignments={assignments}
              conflicts={conflicts}
              onOpen={setOpenAssignmentId}
            />
          ) : null}
          {view === 'week' ? (
            <WeekGrid
              days={days}
              timezone={timezone}
              assignments={assignments}
              conflicts={conflicts}
              onOpen={setOpenAssignmentId}
              onSelectDay={(selected) => {
                setDay(selected);
                setView('day');
              }}
            />
          ) : null}
          {view === 'personnel' ? (
            <PersonnelTimeline
              dayKey={day}
              timezone={timezone}
              personnel={shownPersonnel}
              assignments={assignments}
              conflicts={conflicts}
              onOpen={setOpenAssignmentId}
            />
          ) : null}
        </QueryState>
      </div>

      <AutofillDialog
        open={autofilling}
        onClose={() => setAutofilling(false)}
        assignments={assignments}
        window={{ from: boardWindow.from, to: boardWindow.to }}
        personnel={personnel.data ?? []}
        qualifications={qualifications.data ?? []}
        rules={rules.data ?? []}
        timezone={timezone}
      />

      {/* Keyed on the day so the date it suggests follows the board, rather
          than the day the dialog first mounted. */}
      <StandingRosterDialog
        key={day}
        open={layingOut}
        dayKey={day}
        onClose={() => setLayingOut(false)}
      />

      <AssignmentFormDialog
        open={creating}
        dayKey={day}
        timezone={timezone}
        scheduleId={null}
        onClose={() => setCreating(false)}
      />

      <AssignmentDetailDialog
        assignment={openAssignment}
        conflicts={conflicts.filter((conflict) => conflict.assignmentId === openAssignmentId)}
        timezone={timezone}
        onClose={() => setOpenAssignmentId(null)}
        onEdit={(assignment) => {
          setOpenAssignmentId(null);
          setEditingId(assignment.id);
        }}
      />

      <AssignmentEditDialog
        assignment={editingAssignment}
        timezone={timezone}
        onClose={() => setEditingId(null)}
      />
    </>
  );
}
