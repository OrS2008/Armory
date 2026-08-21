import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { assignmentTypeSchema, type AssignmentTypeInput } from '@shared/schemas';
import { Permissions } from '@shared/rbac';
import type { AssignmentType } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAssignmentTypes, useQualifications } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

export function AssignmentTypesPage() {
  const { can } = useAuth();
  const toast = useToast();
  const types = useAssignmentTypes();
  const qualifications = useQualifications();
  const [editing, setEditing] = useState<AssignmentType | null>(null);
  const [open, setOpen] = useState(false);
  const [requirements, setRequirements] = useState<{ qualificationId: string; minCount: number }[]>(
    [],
  );

  const form = useForm<AssignmentTypeInput>({
    resolver: zodResolver(assignmentTypeSchema),
    defaultValues: {
      name: '',
      defaultDurationMinutes: 480,
      requiredHeadcount: 1,
      requiredQualifications: [],
    },
  });

  const save = useMutation({
    mutationFn: (values: AssignmentTypeInput) => {
      const payload = { ...values, requiredQualifications: requirements };
      return editing
        ? api.patch(`/assignment-types/${editing.id}`, payload)
        : api.post('/assignment-types', payload);
    },
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      setOpen(false);
      setEditing(null);
      void types.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const openDialog = (type: AssignmentType | null) => {
    setEditing(type);
    setRequirements(type ? type.requiredQualifications : []);
    form.reset(
      type
        ? {
            name: type.name,
            category: type.category,
            defaultDurationMinutes: type.defaultDurationMinutes,
            requiredHeadcount: type.requiredHeadcount,
            priority: type.priority,
            instructions: type.instructions,
            active: type.active,
            requiredQualifications: type.requiredQualifications,
          }
        : {
            name: '',
            defaultDurationMinutes: 480,
            requiredHeadcount: 1,
            requiredQualifications: [],
          },
    );
    setOpen(true);
  };

  return (
    <>
      <PageHeader
        title={t('assignments.types')}
        description={t('assignments.typesSubtitle')}
        actions={
          can(Permissions.assignmentTypesWrite) ? (
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => openDialog(null)}>
              {t('assignments.addType')}
            </Button>
          ) : null
        }
      />

      <div className="card p-0">
        <QueryState
          isLoading={types.isLoading}
          error={types.error}
          isEmpty={(types.data ?? []).length === 0}
          emptyDescription={t('assignments.typesEmpty')}
          onRetry={() => void types.refetch()}
        >
          <TableWrapper>
            <thead>
              <tr>
                <Th>{t('assignments.name')}</Th>
                <Th>{t('assignments.category')}</Th>
                <Th>{t('assignments.duration')}</Th>
                <Th>{t('assignments.headcount')}</Th>
                <Th>{t('assignments.requiredQualifications')}</Th>
                <Th>{t('app.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {(types.data ?? []).map((type) => (
                <tr key={type.id} className="hover:bg-surface-sunken">
                  <Td>
                    <span className="font-medium">{type.name}</span>
                    {!type.active ? (
                      <Badge className="ms-2">{t('personnel.statusInactive')}</Badge>
                    ) : null}
                  </Td>
                  <Td>{type.category ?? '—'}</Td>
                  <Td className="ltr-inline">{type.defaultDurationMinutes}</Td>
                  <Td className="ltr-inline">{type.requiredHeadcount}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {type.requiredQualifications.map((requirement) => {
                        const name =
                          qualifications.data?.find(
                            (item) => item.id === requirement.qualificationId,
                          )?.name ?? requirement.qualificationId;
                        return (
                          <Badge key={requirement.qualificationId} tone="brand">
                            {requirement.minCount > 0 ? `${name} ×${requirement.minCount}` : name}
                          </Badge>
                        );
                      })}
                    </div>
                  </Td>
                  <Td>
                    {can(Permissions.assignmentTypesWrite) ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<Pencil className="size-4" />}
                        onClick={() => openDialog(type)}
                      >
                        {t('personnel.edit')}
                      </Button>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </QueryState>
      </div>

      <Dialog
        open={open}
        title={editing ? t('personnel.edit') : t('assignments.addType')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
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
          <Field label={t('assignments.name')} error={form.formState.errors.name?.message} required>
            {({ id, required }) => (
              <Input aria-required={required} id={id} {...form.register('name')} />
            )}
          </Field>
          <Field label={t('assignments.category')}>
            {({ id }) => <Input id={id} {...form.register('category')} />}
          </Field>
          <Field
            label={t('assignments.duration')}
            hint={t('assignments.durationHint')}
            error={form.formState.errors.defaultDurationMinutes?.message}
            required
          >
            {({ id }) => (
              <Input
                id={id}
                type="number"
                dir="ltr"
                {...form.register('defaultDurationMinutes', { valueAsNumber: true })}
              />
            )}
          </Field>
          <Field
            label={t('assignments.headcount')}
            hint={t('assignments.headcountHint')}
            error={form.formState.errors.requiredHeadcount?.message}
            required
          >
            {({ id }) => (
              <Input
                id={id}
                type="number"
                dir="ltr"
                {...form.register('requiredHeadcount', { valueAsNumber: true })}
              />
            )}
          </Field>

          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">
              {t('assignments.requiredQualifications')}
            </legend>
            <p className="mb-2 text-xs text-ink-faint">{t('assignments.qualificationHint')}</p>
            <div className="flex flex-col gap-2">
              {(qualifications.data ?? []).map((qualification) => {
                const current = requirements.find(
                  (item) => item.qualificationId === qualification.id,
                );
                return (
                  <div
                    key={qualification.id}
                    className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle px-2.5 py-1.5 text-sm"
                  >
                    <label className="flex items-center gap-1.5">
                      <input
                        type="checkbox"
                        checked={Boolean(current)}
                        onChange={(event) =>
                          setRequirements(
                            event.target.checked
                              ? [
                                  ...requirements,
                                  { qualificationId: qualification.id, minCount: 1 },
                                ]
                              : requirements.filter(
                                  (item) => item.qualificationId !== qualification.id,
                                ),
                          )
                        }
                      />
                      {qualification.name}
                    </label>
                    {current ? (
                      <Select
                        className="h-8 w-auto"
                        aria-label={qualification.name}
                        value={current.minCount}
                        onChange={(event) =>
                          setRequirements(
                            requirements.map((item) =>
                              item.qualificationId === qualification.id
                                ? { ...item, minCount: Number(event.target.value) }
                                : item,
                            ),
                          )
                        }
                      >
                        <option value={0}>{t('assignments.qualificationScopeAll')}</option>
                        {[1, 2, 3, 4, 5].map((count) => (
                          <option key={count} value={count}>
                            {t('assignments.qualificationScopeSome', { count })}
                          </option>
                        ))}
                      </Select>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </fieldset>

          <Field label={t('assignments.instructions')} className="sm:col-span-2">
            {({ id }) => <Textarea id={id} {...form.register('instructions')} />}
          </Field>
        </form>
      </Dialog>
    </>
  );
}
