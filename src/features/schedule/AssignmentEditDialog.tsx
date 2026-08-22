import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Trash2 } from 'lucide-react';
import { formatRange } from '@shared/format';
import { dayKeySchema, timeSchema } from '@shared/schemas';
import type { Assignment } from '@shared/types';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { splitTimestamp, toTimestamp } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { useCancelAssignment, useUpdateAssignment } from '@/hooks/queries';

const formSchema = z.object({
  title: z.string().max(120).optional(),
  day: dayKeySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  /** Guard duty crosses midnight constantly, so the end day is stated, not guessed. */
  endsNextDay: z.boolean(),
  requiredHeadcount: z.coerce.number().int().min(0).max(500),
  notes: z.string().max(1000).optional(),
});

type FormValues = z.input<typeof formSchema>;

interface Props {
  assignment: Assignment | null;
  timezone: string;
  onClose: () => void;
}

/**
 * Changing or calling off a single shift.
 *
 * A shift that was created is not a fact of nature — its hours move, its
 * headcount changes, and sometimes it does not happen at all. Calling one off
 * cancels it rather than deleting it: who stood there yesterday is a question
 * the sheet still has to be able to answer.
 */
export function AssignmentEditDialog({ assignment, timezone, onClose }: Props) {
  if (!assignment) return null;
  // Keyed on the shift: opening a different one starts a fresh form and a
  // fresh confirmation, rather than syncing state in an effect after the fact.
  return (
    <EditForm key={assignment.id} assignment={assignment} timezone={timezone} onClose={onClose} />
  );
}

function EditForm({
  assignment,
  timezone,
  onClose,
}: {
  assignment: Assignment;
  timezone: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const update = useUpdateAssignment();
  const cancel = useCancelAssignment();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const start = splitTimestamp(assignment.startAt, timezone);
  const end = splitTimestamp(assignment.endAt, timezone);
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: assignment.title ?? '',
      day: start.day,
      startTime: start.time,
      endTime: end.time,
      endsNextDay: end.day !== start.day,
      requiredHeadcount: assignment.requiredHeadcount,
      notes: assignment.notes ?? '',
    },
  });

  const submit = (values: FormValues) => {
    const startAt = toTimestamp(values.day, values.startTime, timezone);
    const endDay = values.endsNextDay ? nextDay(values.day) : values.day;
    const endAt = toTimestamp(endDay, values.endTime, timezone);
    if (endAt <= startAt) {
      form.setError('endTime', { message: t('schedule.endBeforeStart') });
      return;
    }
    update.mutate(
      {
        id: assignment.id,
        startAt,
        endAt,
        requiredHeadcount: Number(values.requiredHeadcount),
        title: values.title?.trim() ? values.title.trim() : null,
        notes: values.notes?.trim() ? values.notes.trim() : null,
      },
      {
        onSuccess: () => {
          toast.push('success', t('state.savedTitle'));
          onClose();
        },
        onError: (error) =>
          toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
      },
    );
  };

  return (
    <Dialog
      open
      title={t('schedule.editAssignment')}
      description={`${assignment.assignmentTypeName} · ${formatRange(
        assignment.startAt,
        assignment.endAt,
        timezone,
      )}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button loading={update.isPending} onClick={() => void form.handleSubmit(submit)()}>
            {t('schedule.saveAssignment')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <Field label={t('assignments.date')} error={form.formState.errors.day?.message} required>
          {({ id, required }) => (
            <Input aria-required={required} id={id} type="date" {...form.register('day')} />
          )}
        </Field>
        <Field
          label={t('assignments.headcount')}
          error={form.formState.errors.requiredHeadcount?.message}
        >
          {({ id }) => (
            <Input id={id} type="number" dir="ltr" {...form.register('requiredHeadcount')} />
          )}
        </Field>
        <Field
          label={t('assignments.startTime')}
          error={form.formState.errors.startTime?.message}
          required
        >
          {({ id, required }) => (
            <Input aria-required={required} id={id} type="time" {...form.register('startTime')} />
          )}
        </Field>
        <Field
          label={t('assignments.endTime')}
          error={form.formState.errors.endTime?.message}
          required
        >
          {({ id, required }) => (
            <Input aria-required={required} id={id} type="time" {...form.register('endTime')} />
          )}
        </Field>
        <label className="flex items-center gap-2 text-sm sm:col-span-2">
          <input type="checkbox" {...form.register('endsNextDay')} />
          {t('assignments.endsNextDay')}
        </label>
        <Field label={t('assignments.name')} className="sm:col-span-2">
          {({ id }) => <Input id={id} {...form.register('title')} />}
        </Field>
        <Field label={t('assignments.notes')} className="sm:col-span-2">
          {({ id }) => <Textarea id={id} {...form.register('notes')} />}
        </Field>
      </form>

      <div className="mt-5 rounded-[var(--radius-control)] border border-danger-soft bg-danger-soft/40 p-3">
        {confirmingCancel ? (
          <div className="flex flex-col gap-2">
            <p className="text-sm text-danger">{t('schedule.cancelAssignmentConfirm')}</p>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="danger"
                size="sm"
                loading={cancel.isPending}
                onClick={() =>
                  cancel.mutate(assignment.id, {
                    onSuccess: () => {
                      toast.push('success', t('schedule.cancelled'));
                      onClose();
                    },
                    onError: (error) =>
                      toast.push(
                        'error',
                        error instanceof ApiError ? error.message : t('state.errorBody'),
                      ),
                  })
                }
              >
                {t('schedule.cancelAssignment')}
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setConfirmingCancel(false)}>
                {t('app.cancel')}
              </Button>
            </div>
          </div>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            icon={<Trash2 className="size-4" />}
            onClick={() => setConfirmingCancel(true)}
          >
            {t('schedule.cancelAssignment')}
          </Button>
        )}
      </div>
    </Dialog>
  );
}

function nextDay(day: string): string {
  const [year, month, date] = day.split('-').map(Number) as [number, number, number];
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  return next.toISOString().slice(0, 10);
}
