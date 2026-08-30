import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { availabilityKindLabels } from '@shared/messages.he';
import type { Availability, AvailabilityKind } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { splitTimestamp, todayKey, toTimestamp } from '@/lib/datetime';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { usePersonnel } from '@/hooks/queries';

interface FormValues {
  personnelId: string;
  kind: AvailabilityKind;
  fromDay: string;
  fromTime: string;
  toDay: string;
  toTime: string;
  reason: string;
}

interface Props {
  open: boolean;
  /** Editing an existing record, or null to create one. */
  entry: Availability | null;
  /** Whoever the new record is for, when there is nothing to edit yet. */
  defaultPersonnelId: string;
  /** A scheduler can enter or correct anyone's record; a soldier only their own. */
  mayManage: boolean;
  onClose: () => void;
  onSaved: () => void;
}

const emptyValues = (personnelId: string): FormValues => ({
  personnelId,
  kind: 'leave',
  fromDay: todayKey(),
  fromTime: '00:00',
  toDay: todayKey(),
  toTime: '23:59',
  reason: '',
});

/**
 * Reassigning whose record this is isn't something an edit does — that is a
 * new request under a different name, not a correction — so the person field
 * is fixed once the record exists and only the "what" and "when" can change.
 */
export function AvailabilityFormDialog({
  open,
  entry,
  defaultPersonnelId,
  mayManage,
  onClose,
  onSaved,
}: Props) {
  const toast = useToast();
  const personnel = usePersonnel();

  const form = useForm<FormValues>({ defaultValues: emptyValues(defaultPersonnelId) });

  useEffect(() => {
    if (!open) return;
    if (!entry) {
      form.reset(emptyValues(defaultPersonnelId));
      return;
    }
    const from = splitTimestamp(entry.startAt);
    const to = splitTimestamp(entry.endAt);
    form.reset({
      personnelId: entry.personnelId,
      kind: entry.kind,
      fromDay: from.day,
      fromTime: from.time,
      toDay: to.day,
      toTime: to.time,
      reason: entry.reason ?? '',
    });
  }, [open, entry, defaultPersonnelId, form]);

  const save = useMutation({
    mutationFn: (values: FormValues) => {
      const body = {
        kind: values.kind,
        startAt: toTimestamp(values.fromDay, values.fromTime),
        endAt: toTimestamp(values.toDay, values.toTime),
        reason: values.reason || null,
      };
      return entry
        ? api.patch(`/availability/${entry.id}`, body)
        : api.post('/availability', { ...body, personnelId: values.personnelId });
    },
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  return (
    <Dialog
      open={open}
      title={
        entry
          ? t('availability.edit')
          : mayManage
            ? t('availability.add')
            : t('availability.request')
      }
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => void form.handleSubmit((values) => save.mutate(values))()}
          >
            {t('app.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        <Field label={t('availability.person')} className="sm:col-span-2">
          {({ id }) => (
            <Select
              id={id}
              disabled={!mayManage || Boolean(entry)}
              {...form.register('personnelId')}
            >
              <option value="">{t('app.none')}</option>
              {(personnel.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('availability.kind')}>
          {({ id }) => (
            <Select id={id} {...form.register('kind')}>
              {Object.entries(availabilityKindLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('availability.reason')}>
          {({ id }) => <Input id={id} {...form.register('reason')} />}
        </Field>

        <Field label={t('availability.from')}>
          {({ id }) => (
            <div className="flex gap-2">
              <Input id={id} type="date" dir="ltr" {...form.register('fromDay')} />
              <Input type="time" dir="ltr" {...form.register('fromTime')} />
            </div>
          )}
        </Field>

        <Field label={t('availability.to')}>
          {({ id }) => (
            <div className="flex gap-2">
              <Input id={id} type="date" dir="ltr" {...form.register('toDay')} />
              <Input type="time" dir="ltr" {...form.register('toTime')} />
            </div>
          )}
        </Field>
      </form>
    </Dialog>
  );
}
