import { useState } from 'react';
import { Pencil, Plus, Power, Trash2 } from 'lucide-react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import {
  assignmentTypeSchema,
  type AssignmentTypeFormValues,
  type AssignmentTypeInput,
} from '@shared/schemas';
import { Permissions } from '@shared/rbac';
import { formatHours } from '@shared/format';
import { STANDING_SHIFT_HOURS } from '@shared/standing';
import type { AssignmentType } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select, Textarea } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { MenuButton, type MenuAction } from '@/components/ui/MenuButton';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import {
  useAssignmentTypes,
  useDeleteAssignmentType,
  useQualifications,
  useSetAssignmentTypeActive,
} from '@/hooks/queries';
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
  const [excluded, setExcluded] = useState<string[]>([]);
  const [removing, setRemoving] = useState<AssignmentType | null>(null);
  /*
   * Removing a post that has been stood takes every shift it was stood on, and
   * everyone who was ever on them. That is not a thing to do by pressing one
   * button on a phone, so it has to be said twice — once by choosing it, once
   * by ticking what it will cost.
   */
  const [acceptsShiftLoss, setAcceptsShiftLoss] = useState(false);
  const remove = useDeleteAssignmentType();
  const setActive = useSetAssignmentTypeActive();

  const form = useForm<AssignmentTypeFormValues, unknown, AssignmentTypeInput>({
    resolver: zodResolver(assignmentTypeSchema),
    defaultValues: {
      name: '',
      defaultDurationMinutes: 480,
      requiredHeadcount: 1,
      requiredQualifications: [],
    },
  });

  const standing = useWatch({ control: form.control, name: 'standing' });

  const save = useMutation({
    mutationFn: (values: AssignmentTypeInput) => {
      const payload = {
        ...values,
        defaultDurationMinutes: Math.round(hours * 60),
        requiredQualifications: requirements,
        excludedQualificationIds: excluded,
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
    setExcluded(type ? type.excludedQualificationIds : []);
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
            excludedQualificationIds: type.excludedQualificationIds,
            standing: type.standing,
            shiftHours: type.shiftHours,
            shiftStartHour: type.shiftStartHour,
            shiftStartMinute: type.shiftStartMinute,
            briefingMinutesBefore: type.briefingMinutesBefore,
            section: type.section,
            sheetLabel: type.sheetLabel,
            crewRoleSuffix: type.crewRoleSuffix,
            sheetColumn: type.sheetColumn,
          }
        : {
            name: '',
            defaultDurationMinutes: 480,
            requiredHeadcount: 1,
            requiredQualifications: [],
            excludedQualificationIds: [],
            standing: false,
            shiftHours: 8,
            shiftStartHour: 0,
            shiftStartMinute: 0,
            briefingMinutesBefore: null,
            section: null,
            sheetLabel: null,
            crewRoleSuffix: null,
            sheetColumn: null,
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
      cell: (type) => (
        <>
          {type.name}
          {type.standing ? (
            <Badge className="ms-2" tone="brand">
              {t('assignments.standingBadge')}
            </Badge>
          ) : null}
        </>
      ),
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
      key: 'usage',
      header: t('assignments.typeShiftsCreated'),
      className: 'ltr-inline tabular-nums',
      cell: (type) => (type.usageCount > 0 ? type.usageCount : null),
    },
    {
      key: 'excluded',
      header: t('assignments.excludedQualifications'),
      cell: (type) =>
        type.excludedQualificationIds.length === 0 ? null : (
          <div className="flex flex-wrap gap-1">
            {type.excludedQualificationIds.map((qualificationId) => (
              <Badge key={qualificationId} tone="danger">
                {qualificationName(qualificationId)}
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
          <div className="flex items-center gap-1.5">
            <Button
              variant="secondary"
              size="sm"
              icon={<Pencil className="size-4" />}
              onClick={() => openDialog(type)}
            >
              {t('personnel.edit')}
            </Button>
            <MenuButton
              label={t('app.more')}
              ariaLabel={`${t('app.more')} — ${type.name}`}
              actions={rowActions(type)}
            />
          </div>
        ) : null,
    },
  ];

  /*
   * Retiring and deleting are different acts, and which one is available is a
   * fact about the post rather than a preference: a post shifts have been
   * created from cannot be deleted without taking those shifts with it, so it
   * is retired instead. Both are offered, and the one that cannot work says why
   * when it is pressed rather than being silently absent.
   */
  const rowActions = (type: AssignmentType): MenuAction[] => [
    {
      key: 'active',
      label: type.active ? t('assignments.retireType') : t('assignments.restoreType'),
      ...(type.active ? { hint: t('assignments.retireTypeHint') } : {}),
      icon: <Power className="size-4" />,
      onSelect: () =>
        setActive.mutate(
          { id: type.id, active: !type.active },
          {
            onSuccess: () =>
              toast.push(
                'success',
                type.active ? t('assignments.retireTypeDone') : t('assignments.restoreTypeDone'),
              ),
            onError: (error) =>
              toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
          },
        ),
    },
    {
      key: 'delete',
      label: t('assignments.deleteType'),
      // A post that has been stood can be removed too — it just takes its
      // shifts with it, which the confirmation says in so many words. Refusing
      // outright left the only way out in a workflow nobody on a phone can run.
      hint:
        type.usageCount > 0
          ? t('assignments.deleteTypeInUse', { count: type.usageCount })
          : t('assignments.typeUnused'),
      icon: <Trash2 className="size-4" />,
      onSelect: () => {
        setAcceptsShiftLoss(false);
        setRemoving(type);
      },
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
        open={Boolean(removing)}
        title={t('assignments.deleteType')}
        {...(removing
          ? {
              description:
                removing.usageCount > 0
                  ? t('assignments.deleteTypeWithShiftsConfirm', {
                      name: removing.name,
                      count: removing.usageCount,
                    })
                  : t('assignments.deleteTypeConfirm', { name: removing.name }),
            }
          : {})}
        onClose={() => setRemoving(null)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setRemoving(null)}>
              {t('app.cancel')}
            </Button>
            <Button
              variant="danger"
              disabled={Boolean(removing && removing.usageCount > 0 && !acceptsShiftLoss)}
              loading={remove.isPending}
              onClick={() =>
                removing &&
                remove.mutate(
                  { id: removing.id, withShifts: removing.usageCount > 0 },
                  {
                    onSuccess: (result) => {
                      toast.push(
                        'success',
                        result.shifts > 0
                          ? t('assignments.deleteTypeWithShiftsDone', { count: result.shifts })
                          : t('assignments.deleteTypeDone'),
                      );
                      setRemoving(null);
                      setAcceptsShiftLoss(false);
                    },
                    onError: (error) =>
                      toast.push(
                        'error',
                        error instanceof ApiError ? error.message : t('state.errorBody'),
                      ),
                  },
                )
              }
            >
              {t('assignments.deleteType')}
            </Button>
          </>
        }
      >
        {removing && removing.usageCount > 0 ? (
          <label className="mb-3 flex items-start gap-2 text-sm text-danger">
            <input
              type="checkbox"
              className="mt-0.5"
              checked={acceptsShiftLoss}
              onChange={(event) => setAcceptsShiftLoss(event.target.checked)}
            />
            <span>
              {t('assignments.deleteTypeAcceptShiftLoss', { count: removing.usageCount })}
            </span>
          </label>
        ) : null}
        <p className="text-sm text-ink-muted">{t('assignments.retireTypeHint')}</p>
      </Dialog>

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
            <label className="flex items-start gap-2 rounded-[var(--radius-control)] border border-border-subtle p-3 text-sm">
              <input type="checkbox" className="mt-1" {...form.register('standing')} />
              <span>
                <span className="block font-medium">{t('assignments.standing')}</span>
                <span className="block text-xs text-ink-muted">
                  {t('assignments.standingHint')}
                </span>
              </span>
            </label>
            {standing ? (
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field label={t('assignments.shiftHours')}>
                  {({ id }) => (
                    <Select id={id} {...form.register('shiftHours', { valueAsNumber: true })}>
                      {STANDING_SHIFT_HOURS.map((option) => (
                        <option key={option} value={option}>
                          {t('assignments.shiftHoursOption', { hours: option })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label={t('assignments.shiftStartHour')}>
                  {({ id }) => (
                    <Select id={id} {...form.register('shiftStartHour', { valueAsNumber: true })}>
                      {Array.from({ length: 24 }, (_unused, hour) => (
                        <option key={hour} value={hour}>
                          {`${String(hour).padStart(2, '0')}:00`}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                {/* Not every handover is on the hour: משקיף changes at 06:30. */}
                <Field label={t('assignments.shiftStartMinute')}>
                  {({ id }) => (
                    <Select id={id} {...form.register('shiftStartMinute', { valueAsNumber: true })}>
                      {[0, 15, 30, 45].map((minute) => (
                        <option key={minute} value={minute}>
                          {`:${String(minute).padStart(2, '0')}`}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field
                  label={t('assignments.briefingMinutesBefore')}
                  hint={t('assignments.briefingMinutesBeforeHint')}
                >
                  {({ id }) => (
                    <Select
                      id={id}
                      {...form.register('briefingMinutesBefore', {
                        setValueAs: (value) => (value === '' ? null : Number(value)),
                      })}
                    >
                      <option value="">{t('assignments.briefingMinutesBeforeNone')}</option>
                      {[10, 15, 20, 30, 45, 60].map((minutes) => (
                        <option key={minutes} value={minutes}>
                          {t('assignments.briefingMinutesBeforeOption', { minutes })}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            ) : null}
          </fieldset>

          {/*
           * Where the post prints. The sheet is a fixed page, not a packing
           * problem: a post sits in the column it always sits in, under the
           * gate it is stood at, titled the way the company titles it.
           */}
          <fieldset className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
            <legend className="mb-1 text-sm font-medium">{t('assignments.sheetSection')}</legend>
            <Field
              label={t('assignments.section')}
              hint={t('assignments.sectionHint')}
              error={form.formState.errors.section?.message}
            >
              {({ id }) => <Input id={id} {...form.register('section')} />}
            </Field>
            <Field
              label={t('assignments.sheetLabel')}
              hint={t('assignments.sheetLabelHint')}
              error={form.formState.errors.sheetLabel?.message}
            >
              {({ id }) => <Input id={id} {...form.register('sheetLabel')} />}
            </Field>
            <Field
              label={t('assignments.crewRoleSuffix')}
              hint={t('assignments.crewRoleSuffixHint')}
              error={form.formState.errors.crewRoleSuffix?.message}
            >
              {({ id }) => <Input id={id} {...form.register('crewRoleSuffix')} />}
            </Field>
            <Field
              label={t('assignments.sheetColumn')}
              error={form.formState.errors.sheetColumn?.message}
            >
              {({ id }) => (
                <Select id={id} {...form.register('sheetColumn')}>
                  <option value="">{t('assignments.sheetColumnAuto')}</option>
                  {[1, 2, 3].map((column) => (
                    <option key={column} value={column}>
                      {t('assignments.sheetColumnOption', { column })}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
          </fieldset>

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

          <fieldset className="sm:col-span-2">
            <legend className="mb-1 text-sm font-medium">
              {t('assignments.excludedQualifications')}
            </legend>
            <p className="mb-2 text-xs text-ink-faint">{t('assignments.excludedHint')}</p>
            <div className="flex flex-wrap gap-2">
              {(qualifications.data ?? []).map((qualification) => (
                <label
                  key={qualification.id}
                  className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border-subtle px-2.5 py-1.5 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={excluded.includes(qualification.id)}
                    onChange={(event) =>
                      setExcluded(
                        event.target.checked
                          ? [...excluded, qualification.id]
                          : excluded.filter((item) => item !== qualification.id),
                      )
                    }
                  />
                  {qualification.name}
                </label>
              ))}
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
