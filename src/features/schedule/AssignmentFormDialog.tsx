import { useEffect, useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation } from '@tanstack/react-query';
import { validationMessages } from '@shared/messages.he';
import { formatDayKey, formatRange, formatTime, hebrewWeekdays } from '@shared/format';
import { SHIFT_HOUR_OPTIONS, expandRecurrence } from '@shared/recurrence';
import { dayKeySchema, timeSchema } from '@shared/schemas';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { toTimestamp } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { useAssignmentTypes, useScheduleInvalidation, useUnits } from '@/hooks/queries';

const formSchema = z.object({
  assignmentTypeId: z.string().min(1, validationMessages.required),
  title: z.string().max(120).optional(),
  day: dayKeySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  /** Crossing midnight is normal for guard duty, so the end day is explicit. */
  endsNextDay: z.boolean(),
  requiredHeadcount: z.coerce.number().int().min(0).max(500),
  unitId: z.string().optional(),
  notes: z.string().max(1000).optional(),
  frequency: z.enum(['none', 'daily', 'weekdays']),
  /** 0 = a single occurrence per day; otherwise a round-the-clock rotation. */
  shiftHours: z.coerce.number().int().min(0).max(12),
  weekdays: z.array(z.coerce.number().int().min(0).max(6)).optional(),
  untilDate: z.string().optional(),
});

type FormValues = z.input<typeof formSchema>;

interface Props {
  open: boolean;
  dayKey: string;
  timezone: string;
  scheduleId: string | null;
  onClose: () => void;
}

export function AssignmentFormDialog({ open, dayKey, timezone, scheduleId, onClose }: Props) {
  const types = useAssignmentTypes();
  const units = useUnits();
  const invalidate = useScheduleInvalidation();
  const toast = useToast();

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      assignmentTypeId: '',
      day: dayKey,
      startTime: '08:00',
      endTime: '16:00',
      endsNextDay: false,
      requiredHeadcount: 1,
      frequency: 'none',
      shiftHours: 0,
      weekdays: [],
    },
  });

  useEffect(() => {
    form.setValue('day', dayKey);
  }, [dayKey, form]);

  // Selecting a type pre-fills its default duration and headcount.
  const selectedTypeId = useWatch({ control: form.control, name: 'assignmentTypeId' });
  useEffect(() => {
    const type = types.data?.find((item) => item.id === selectedTypeId);
    if (!type) return;
    form.setValue('requiredHeadcount', type.requiredHeadcount);
    const [hours, minutes] = (form.getValues('startTime') || '08:00').split(':').map(Number);
    const endMinutes = (hours ?? 8) * 60 + (minutes ?? 0) + type.defaultDurationMinutes;
    const endHour = Math.floor(endMinutes / 60);
    form.setValue(
      'endTime',
      `${String(endHour % 24).padStart(2, '0')}:${String(endMinutes % 60).padStart(2, '0')}`,
    );
    form.setValue('endsNextDay', endHour >= 24);
  }, [selectedTypeId, types.data, form]);

  const createAssignment = useMutation({
    mutationFn: (values: FormValues) => {
      const parsed = formSchema.parse(values);
      const startAt = toTimestamp(parsed.day, parsed.startTime, timezone);
      const endDay = parsed.endsNextDay ? nextDay(parsed.day) : parsed.day;
      const endAt = toTimestamp(endDay, parsed.endTime, timezone);
      return api.post<{ count: number; blocking: number }>('/assignments', {
        assignmentTypeId: parsed.assignmentTypeId,
        scheduleId,
        unitId: parsed.unitId || null,
        title: parsed.title || null,
        notes: parsed.notes || null,
        startAt,
        endAt,
        requiredHeadcount: parsed.requiredHeadcount,
        recurrence:
          parsed.frequency === 'none'
            ? { frequency: 'none' }
            : {
                frequency: parsed.frequency,
                weekdays: parsed.weekdays ?? [],
                untilDate: parsed.untilDate,
                ...(parsed.shiftHours > 0 ? { shiftHours: parsed.shiftHours } : {}),
              },
      });
    },
    onSuccess: (result) => {
      invalidate();
      toast.push('success', `${t('state.savedTitle')} · ${result.count}`);
      form.reset();
      onClose();
    },
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));
    },
  });

  const frequency = useWatch({ control: form.control, name: 'frequency' });
  const day = useWatch({ control: form.control, name: 'day' });
  const startTime = useWatch({ control: form.control, name: 'startTime' });
  const endTime = useWatch({ control: form.control, name: 'endTime' });
  const endsNextDay = useWatch({ control: form.control, name: 'endsNextDay' });
  const untilDate = useWatch({ control: form.control, name: 'untilDate' });
  const weekdaysPicked = useWatch({ control: form.control, name: 'weekdays' });
  const shiftHours = Number(useWatch({ control: form.control, name: 'shiftHours' }) ?? 0);

  /**
   * Says in words what the form is about to create. The alternative is asking
   * the reader to hold a recurrence rule, a shift length and a date range in
   * their head and work out the answer themselves.
   */
  const preview = useMemo(() => {
    if (!selectedTypeId || !day || !startTime) return t('assignments.previewIncomplete');

    const startAt = toTimestamp(day, startTime, timezone);
    const endAt = toTimestamp(endsNextDay ? nextDay(day) : day, endTime || startTime, timezone);
    if (frequency === 'none' || !untilDate) {
      return t('assignments.previewOne', { range: formatRange(startAt, endAt, timezone) });
    }

    const occurrences = expandRecurrence(
      startAt,
      endAt,
      {
        frequency,
        weekdays: (weekdaysPicked ?? []).map(Number),
        untilDate,
        ...(shiftHours > 0 ? { shiftHours } : {}),
      },
      timezone,
    );
    if (occurrences.length === 0) return t('assignments.previewIncomplete');

    if (shiftHours > 0) {
      const perDay = 24 / shiftHours;
      const times = occurrences
        .slice(0, perDay)
        .map((occurrence) => formatTime(occurrence.startAt, timezone))
        .join(', ');
      return t('assignments.previewShifts', {
        count: perDay,
        times,
        until: formatDayKey(untilDate),
        total: occurrences.length,
      });
    }
    return t('assignments.previewDaily', {
      until: formatDayKey(untilDate),
      total: occurrences.length,
    });
  }, [
    selectedTypeId,
    day,
    startTime,
    endTime,
    endsNextDay,
    frequency,
    untilDate,
    weekdaysPicked,
    shiftHours,
    timezone,
  ]);

  return (
    <Dialog
      open={open}
      title={t('schedule.newAssignment')}
      onClose={onClose}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            loading={createAssignment.isPending}
            onClick={() => void form.handleSubmit((values) => createAssignment.mutate(values))()}
          >
            {t('assignments.create')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        {types.data && types.data.filter((type) => type.active).length === 0 ? (
          <p className="rounded-[var(--radius-control)] bg-warning-soft px-3 py-2 text-sm text-warning">
            {t('assignments.noTypes')}
          </p>
        ) : null}

        {/* The four fields that actually decide what gets created. Everything
            else has a sensible default taken from the assignment type. */}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label={t('assignments.type')}
            error={form.formState.errors.assignmentTypeId?.message}
            required
          >
            {({ id, describedBy, invalid }) => (
              <Select
                id={id}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register('assignmentTypeId')}
              >
                <option value="">{t('assignments.typePlaceholder')}</option>
                {(types.data ?? [])
                  .filter((type) => type.active)
                  .map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
              </Select>
            )}
          </Field>

          <Field label={t('assignments.date')} error={form.formState.errors.day?.message} required>
            {({ id, required }) => (
              <Input
                aria-required={required}
                id={id}
                type="date"
                dir="ltr"
                {...form.register('day')}
              />
            )}
          </Field>

          <Field
            label={t('assignments.startTime')}
            error={form.formState.errors.startTime?.message}
            required
          >
            {({ id, required }) => (
              <Input
                aria-required={required}
                id={id}
                type="time"
                dir="ltr"
                step={300}
                {...form.register('startTime')}
              />
            )}
          </Field>

          <Field label={t('assignments.recurrence')}>
            {({ id }) => (
              <Select id={id} {...form.register('frequency')}>
                <option value="none">{t('assignments.recurrenceNone')}</option>
                <option value="daily">{t('assignments.recurrenceDaily')}</option>
                <option value="weekdays">{t('assignments.recurrenceWeekdays')}</option>
              </Select>
            )}
          </Field>

          {frequency !== 'none' ? (
            <>
              <Field label={t('assignments.shiftRotation')}>
                {({ id }) => (
                  <Select id={id} {...form.register('shiftHours')}>
                    <option value={0}>{t('assignments.shiftRotationOff')}</option>
                    {SHIFT_HOUR_OPTIONS.map((hours) => (
                      <option key={hours} value={hours}>
                        {t('assignments.shiftEvery', { hours })}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>

              <Field label={t('assignments.recurrenceUntil')}>
                {({ id }) => (
                  <Input id={id} type="date" dir="ltr" {...form.register('untilDate')} />
                )}
              </Field>

              {frequency === 'weekdays' ? (
                <fieldset className="sm:col-span-2">
                  <legend className="mb-1.5 text-sm font-medium">
                    {t('assignments.recurrenceWeekdays')}
                  </legend>
                  <div className="flex flex-wrap gap-2">
                    {hebrewWeekdays.map((name, index) => (
                      <label
                        key={name}
                        className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border-subtle px-2.5 py-1.5 text-sm"
                      >
                        <input type="checkbox" value={index} {...form.register('weekdays')} />
                        {name}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}
            </>
          ) : null}
        </div>

        {/* Plain language beats making the reader simulate the form in their head. */}
        <p className="rounded-[var(--radius-control)] bg-surface-sunken px-3 py-2 text-sm">
          <span className="font-medium">{t('assignments.preview')}: </span>
          {preview}
        </p>

        <details className="rounded-[var(--radius-control)] border border-border-subtle">
          <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
            {t('assignments.advanced')}
          </summary>
          <div className="grid gap-4 border-t border-border-subtle p-3 sm:grid-cols-2">
            <p className="text-xs text-ink-faint sm:col-span-2">{t('assignments.advancedHint')}</p>

            <Field label={t('assignments.name')} error={form.formState.errors.title?.message}>
              {({ id }) => <Input id={id} {...form.register('title')} />}
            </Field>

            <Field label={t('personnel.unit')}>
              {({ id }) => (
                <Select id={id} {...form.register('unitId')}>
                  <option value="">{t('assignments.anyUnit')}</option>
                  {(units.data ?? []).map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.name}
                    </option>
                  ))}
                </Select>
              )}
            </Field>

            <Field
              label={t('assignments.headcount')}
              error={form.formState.errors.requiredHeadcount?.message}
            >
              {({ id }) => (
                <Input
                  id={id}
                  type="number"
                  min={0}
                  max={500}
                  dir="ltr"
                  {...form.register('requiredHeadcount')}
                />
              )}
            </Field>

            {shiftHours > 0 ? null : (
              <Field
                label={t('assignments.endTime')}
                error={form.formState.errors.endTime?.message}
              >
                {({ id }) => (
                  <div className="flex items-center gap-2">
                    <Input id={id} type="time" dir="ltr" step={300} {...form.register('endTime')} />
                    <label className="flex shrink-0 items-center gap-1.5 text-xs text-ink-muted">
                      <input type="checkbox" {...form.register('endsNextDay')} />
                      {t('assignments.nextDayShort')}
                    </label>
                  </div>
                )}
              </Field>
            )}

            <Field label={t('assignments.notes')} className="sm:col-span-2">
              {({ id }) => <Textarea id={id} {...form.register('notes')} />}
            </Field>
          </div>
        </details>
      </form>
    </Dialog>
  );
}

function nextDay(dayKey: string): string {
  const [year, month, day] = dayKey.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, day + 1));
  return `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`;
}
