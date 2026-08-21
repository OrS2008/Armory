import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Printer,
  Send,
  Sparkles,
  TriangleAlert,
} from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { formatDayKey, weekdayName } from '@shared/format';
import { Permissions } from '@shared/rbac';
import { addDays, endOfDay, startOfDay, weekDays } from '@shared/time';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { todayKey } from '@/lib/datetime';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Select } from '@/components/ui/Input';
import { QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { DayTimeline } from '@/components/scheduling/DayTimeline';
import { PersonnelTimeline } from '@/components/scheduling/PersonnelTimeline';
import { WeekGrid } from '@/components/scheduling/WeekGrid';
import { useToast } from '@/components/ui/toast-context';
import {
  useAssignments,
  useAvailability,
  usePersonnel,
  useQualifications,
  useRules,
  useScheduleInvalidation,
  useSchedules,
  useUnits,
} from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';
import { AssignmentDetailDialog } from './AssignmentDetailDialog';
import { AssignmentFormDialog } from './AssignmentFormDialog';
import { AutofillDialog } from './AutofillDialog';

type View = 'day' | 'week' | 'personnel';

export function ScheduleBoardPage() {
  const { can } = useAuth();
  const toast = useToast();
  const invalidate = useScheduleInvalidation();

  const [view, setView] = useState<View>('day');
  const [day, setDay] = useState(() => todayKey());
  const [unitId, setUnitId] = useState('');
  const [scheduleId, setScheduleId] = useState('');
  const [creating, setCreating] = useState(false);
  const [openAssignmentId, setOpenAssignmentId] = useState<string | null>(null);
  const [autofilling, setAutofilling] = useState(false);

  const units = useUnits();
  const schedules = useSchedules();
  const personnel = usePersonnel(unitId ? { unitId } : {});
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
  const availability = useAvailability({
    from: boardWindow.from,
    to: boardWindow.to,
    status: 'approved',
  });
  const timezone = board.data?.timezone ?? 'Asia/Jerusalem';
  const assignments = board.data?.assignments ?? [];
  const conflicts = board.data?.conflicts ?? [];
  const blockingCount = conflicts.filter((conflict) => conflict.severity === 'blocking').length;
  const openAssignment = assignments.find((item) => item.id === openAssignmentId) ?? null;

  const publish = useMutation({
    mutationFn: (id: string) =>
      api.post<{ version: number; notified: number }>(`/schedules/${id}/publish`, {}),
    onSuccess: (result) => {
      invalidate();
      toast.push('success', `${t('schedule.published')} (${result.notified})`);
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));
    },
  });

  const shift = (direction: -1 | 1) =>
    setDay((current) => addDays(current, view === 'week' ? 7 * direction : direction));

  return (
    <>
      <PageHeader
        title={t('schedule.title')}
        actions={
          <>
            <Link
              to="/schedule/conflicts"
              className={cn(
                'inline-flex items-center gap-1.5 rounded-[var(--radius-control)] px-3 py-1.5 text-sm font-medium',
                blockingCount > 0
                  ? 'bg-danger-soft text-danger'
                  : 'text-ink-muted hover:bg-surface-sunken',
              )}
            >
              <TriangleAlert className="size-4" aria-hidden />
              {t('conflicts.title')}
              {conflicts.length > 0 ? <Badge tone="neutral">{conflicts.length}</Badge> : null}
            </Link>

            {can(Permissions.schedulesPublish) ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Send className="size-4" />}
                disabled={!scheduleId || publish.isPending}
                loading={publish.isPending}
                onClick={() => {
                  if (scheduleId && window.confirm(t('schedule.publishConfirm'))) {
                    publish.mutate(scheduleId);
                  }
                }}
              >
                {t('schedule.publish')}
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="sm"
              icon={<Printer className="size-4" />}
              onClick={() => window.print()}
            >
              {t('schedule.print')}
            </Button>

            {can(Permissions.assignmentsAssign) ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<Sparkles className="size-4" />}
                disabled={assignments.length === 0}
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

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-[var(--radius-control)] border border-border-subtle bg-surface-raised p-1">
          <IconButton
            label={t('schedule.previousDay')}
            icon={<ChevronRight className="size-4" />}
            onClick={() => shift(-1)}
          />
          <span className="ltr-inline min-w-32 text-center text-sm font-medium">
            {formatDayKey(day)}
          </span>
          <IconButton
            label={t('schedule.nextDay')}
            icon={<ChevronLeft className="size-4" />}
            onClick={() => shift(1)}
          />
        </div>
        <Button variant="secondary" size="sm" onClick={() => setDay(todayKey())}>
          {t('app.today')}
        </Button>
        <span className="text-sm text-ink-muted">{weekdayName(day)}</span>

        <div
          role="tablist"
          aria-label={t('schedule.title')}
          className="flex items-center gap-1 rounded-[var(--radius-control)] bg-surface-sunken p-1"
        >
          {(['day', 'week', 'personnel'] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={view === option}
              onClick={() => setView(option)}
              className={cn(
                'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                view === option ? 'bg-surface-raised text-ink shadow-sm' : 'text-ink-muted',
              )}
            >
              {option === 'day'
                ? t('schedule.day')
                : option === 'week'
                  ? t('schedule.week')
                  : t('schedule.byPersonnel')}
            </button>
          ))}
        </div>

        <Select
          className="w-auto"
          aria-label={t('personnel.unit')}
          value={unitId}
          onChange={(event) => setUnitId(event.target.value)}
        >
          <option value="">{t('app.all')}</option>
          {(units.data ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>

        {can(Permissions.schedulesPublish) ? (
          <Select
            className="w-auto"
            aria-label={t('schedule.selectSchedule')}
            value={scheduleId}
            onChange={(event) => setScheduleId(event.target.value)}
          >
            <option value="">{t('schedule.selectSchedule')}</option>
            {(schedules.data ?? []).map((schedule) => (
              <option key={schedule.id} value={schedule.id}>
                {schedule.name}
              </option>
            ))}
          </Select>
        ) : null}
      </div>

      <p className="print-title">
        {t('app.name')} · {weekdayName(day)} {formatDayKey(day)}
      </p>

      <div className="card p-3 sm:p-4">
        <QueryState
          isLoading={board.isLoading}
          error={board.error}
          onRetry={() => void board.refetch()}
        >
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
              personnel={personnel.data ?? []}
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
        personnel={personnel.data ?? []}
        availability={availability.data ?? []}
        qualifications={qualifications.data ?? []}
        rules={rules.data ?? []}
        timezone={timezone}
      />

      <AssignmentFormDialog
        open={creating}
        dayKey={day}
        timezone={timezone}
        scheduleId={scheduleId || null}
        onClose={() => setCreating(false)}
      />

      <AssignmentDetailDialog
        assignment={openAssignment}
        conflicts={conflicts.filter((conflict) => conflict.assignmentId === openAssignmentId)}
        timezone={timezone}
        onClose={() => setOpenAssignmentId(null)}
      />
    </>
  );
}
