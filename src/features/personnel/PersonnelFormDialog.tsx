import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { personnelSchema, type PersonnelInput } from '@shared/schemas';
import type { Personnel } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { useQualifications, useUnits } from '@/hooks/queries';

interface Props {
  open: boolean;
  person: Personnel | null;
  onClose: () => void;
  onSaved: () => void;
}

export function PersonnelFormDialog({ open, person, onClose, onSaved }: Props) {
  const units = useUnits();
  const qualifications = useQualifications();
  const toast = useToast();

  const form = useForm<PersonnelInput>({
    resolver: zodResolver(personnelSchema),
    defaultValues: { displayName: '', status: 'active', qualificationIds: [] },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      person
        ? {
            displayName: person.displayName,
            externalId: person.externalId,
            unitId: person.unitId,
            roleTitle: person.roleTitle,
            phone: person.phone,
            status: person.status,
            notes: person.notes,
            qualificationIds: person.qualificationIds,
          }
        : { displayName: '', status: 'active', qualificationIds: [] },
    );
  }, [open, person, form]);

  const save = useMutation({
    mutationFn: (values: PersonnelInput) =>
      person ? api.patch(`/personnel/${person.id}`, values) : api.post('/personnel', values),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      onSaved();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        for (const [field, message] of Object.entries(error.fieldErrors)) {
          form.setError(field as keyof PersonnelInput, { message });
        }
        toast.push('error', error.message);
      } else {
        toast.push('error', t('state.errorBody'));
      }
    },
  });

  return (
    <Dialog
      open={open}
      title={person ? t('personnel.edit') : t('personnel.add')}
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
        <Field
          label={t('personnel.name')}
          error={form.formState.errors.displayName?.message}
          required
        >
          {({ id, invalid, required }) => (
            <Input
              id={id}
              aria-invalid={invalid}
              aria-required={required}
              {...form.register('displayName')}
            />
          )}
        </Field>

        <Field label={t('personnel.externalId')} error={form.formState.errors.externalId?.message}>
          {({ id }) => <Input id={id} dir="ltr" {...form.register('externalId')} />}
        </Field>

        <Field label={t('personnel.unit')}>
          {({ id }) => (
            <Select id={id} {...form.register('unitId')}>
              <option value="">{t('app.none')}</option>
              {(units.data ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('personnel.roleTitle')}>
          {({ id }) => <Input id={id} {...form.register('roleTitle')} />}
        </Field>

        <Field label={t('personnel.phone')} error={form.formState.errors.phone?.message}>
          {({ id }) => <Input id={id} type="tel" dir="ltr" {...form.register('phone')} />}
        </Field>

        <Field label={t('personnel.status')}>
          {({ id }) => (
            <Select id={id} {...form.register('status')}>
              <option value="active">{t('personnel.statusActive')}</option>
              <option value="inactive">{t('personnel.statusInactive')}</option>
              <option value="archived">{t('personnel.statusArchived')}</option>
            </Select>
          )}
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1.5 text-sm font-medium">{t('personnel.qualifications')}</legend>
          <div className="flex flex-wrap gap-2">
            {(qualifications.data ?? []).map((qualification) => (
              <label
                key={qualification.id}
                className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border-subtle px-2.5 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  value={qualification.id}
                  {...form.register('qualificationIds')}
                />
                {qualification.name}
              </label>
            ))}
          </div>
        </fieldset>

        <Field label={t('personnel.notes')} className="sm:col-span-2">
          {({ id }) => <Textarea id={id} {...form.register('notes')} />}
        </Field>
      </form>
    </Dialog>
  );
}
