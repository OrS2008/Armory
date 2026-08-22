import { useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { formatHours } from '@shared/format';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useAssignmentTypes, useStandingRoster } from '@/hooks/queries';

interface Props {
  open: boolean;
  /** Seeds the start date, so the visible day is the obvious default. */
  dayKey: string;
  onClose: () => void;
}

/**
 * Lay the fixed roster out across a period.
 *
 * ש״ג, סיור, נחל שכם and כרמל are not decided each morning — they run
 * continuously for months. Asking for them a day at a time is asking somebody
 * to retype a fact that never changes, so the period is stated once and every
 * shift in it is created at once. Running it again is harmless: shifts that
 * already exist are counted and skipped, cancelled ones included.
 */
export function StandingRosterDialog({ open, dayKey, onClose }: Props) {
  const toast = useToast();
  const types = useAssignmentTypes();
  const generate = useStandingRoster();
  const [fromDate, setFromDate] = useState(dayKey);
  const [toDate, setToDate] = useState(() => addDays(dayKey, 30));

  const standing = (types.data ?? []).filter((type) => type.active && type.standing);

  const submit = () =>
    generate.mutate(
      { fromDate, toDate },
      {
        onSuccess: (result) => {
          toast.push(
            result.created > 0 ? 'success' : 'info',
            result.created > 0
              ? t('schedule.standingDone', { created: result.created, skipped: result.skipped })
              : t('schedule.standingNothing'),
          );
          if (result.created > 0) onClose();
        },
        onError: (error) =>
          toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
      },
    );

  return (
    <Dialog
      open={open}
      title={t('schedule.standingTitle')}
      description={t('schedule.standingSubtitle')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            icon={<CalendarRange className="size-4" />}
            disabled={standing.length === 0 || toDate < fromDate}
            loading={generate.isPending}
            onClick={submit}
          >
            {t('schedule.standingCreate')}
          </Button>
        </>
      }
    >
      {standing.length === 0 ? (
        <EmptyState description={t('schedule.standingNoPosts')} />
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t('schedule.standingFrom')}>
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={fromDate}
                  onChange={(event) => setFromDate(event.target.value)}
                />
              )}
            </Field>
            <Field label={t('schedule.standingTo')}>
              {({ id }) => (
                <Input
                  id={id}
                  type="date"
                  value={toDate}
                  min={fromDate}
                  onChange={(event) => setToDate(event.target.value)}
                />
              )}
            </Field>
          </div>

          <ul className="flex flex-col gap-1.5 rounded-[var(--radius-control)] bg-surface-sunken p-3 text-sm">
            {standing.map((type) => (
              <li key={type.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <span className="font-medium">{type.name}</span>
                <span className="text-xs text-ink-muted">
                  {type.shiftHours === 24
                    ? t('assignments.shiftRotationHintOne')
                    : t('assignments.shiftRotationHint', { count: 24 / type.shiftHours })}
                </span>
                <span className="ltr-inline ms-auto text-xs text-ink-faint">
                  {t('schedule.standingCrew', { count: type.requiredHeadcount })} ·{' '}
                  {formatHours(type.shiftHours)}
                </span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-ink-muted">{t('schedule.standingRepeat')}</p>
        </div>
      )}
    </Dialog>
  );
}

function addDays(day: string, days: number): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(year, month - 1, date + days)).toISOString().slice(0, 10);
}
