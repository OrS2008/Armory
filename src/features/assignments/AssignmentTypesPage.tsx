import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { assignmentTypeSchema, type AssignmentTypeInput } from '@shared/schemas';
import { Permissions } from '@shared/rbac';
import { formatHours } from '@shared/format';
import type { AssignmentType } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
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
  // Shifts are spoken about in hours — "רביעייה", "משמרת שמונה". Minutes stay
  // the stored unit because they divide cleanly; nobody has to read them.
  const [hours, setHours] = useState(8);

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
      const payload = {
        ...values,
        defaultDurationMinutes: Math.round(hours * 60),
        requiredQualifications: requirements,
      };
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
    setHours(type ? type.defaultDurationMinutes / 60 : 8);
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

  const rows = types.data ?? [];
  const qualificationName = (id: string) =>
    qualifications.data?.find((item) => item.id === id)?.name ?? id;

  const columns: Column<AssignmentType>[] = [
    {
      key: 'name',
      header: t('assignments.name'),
      placement: 'title',
      cell: (type) => type.name,
    },
    {
      key: 'active',
      header: t('personnel.status'),
      placement: 'badge',
      cell: (type) => (type.active ? null : <Badge>{t('personnel.statusInactive')}</Badge>),
    },
    { key: 'category', header: t('assignments.category'), cell: (type) => type.category },
    {
      key: 'duration',
      header: t('assignments.duration'),
      className: 'ltr-inline tabular-nums',
      cell: (type) => formatHours(type.defaultDurationMinutes / 60),
    },
    {
      key: 'headcount',
      header: t('assignments.headcount'),
      className: 'ltr-inline tabular-nums',
      cell: (type) => type.requiredHeadcount,
    },
    {
      key: 'qualifications',
      header: t('assignments.requiredQualifications'),
      cell: (type) =>
        type.requiredQualifications.length === 0 ? null : (
          <div className="flex flex-wrap gap-1">
            {type.requiredQualifications.map((requirement) => (
              <Badge key={requirement.qualificationId} tone="brand">
                {requirement.minCount > 0
                  ? `${qualificationName(requirement.qualificationId)} ×${requirement.minCount}`
                  : qualificationName(requirement.qualificationId)}
              </Badge>
            ))}
          </div>
        ),
    },
    {
      key: 'actions',
      header: t('app.actions'),
      placement: 'actions',
      cell: (type) =>
        can(Permissions.assignmentTypesWrite) ? (
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="size-4" />}
            onClick={() => openDialog(type)}
          >
            {t('personnel.edit')}
          </Button>
        ) : null,
    },
  ];

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
          isEmpty={rows.length === 0}
          emptyDescription={t('assignments.typesEmpty')}
          onRetry={() => void types.refetch()}
        >
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(type) => type.id}
            caption={t('assignments.types')}
          />
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
                min={0.25}
                step={0.25}
                value={hours}
                onChange={(event) => setHours(Number(event.target.value))}
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
