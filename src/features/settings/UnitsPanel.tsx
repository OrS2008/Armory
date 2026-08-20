import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { unitSchema, type UnitInput } from '@shared/schemas';
import { Permissions } from '@shared/rbac';
import type { UnitKind } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useUnits } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

const kindLabels: Record<UnitKind, string> = {
  company: t('settings.unitKindCompany'),
  platoon: t('settings.unitKindPlatoon'),
  team: t('settings.unitKindTeam'),
};

export function UnitsPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const units = useUnits();
  const [open, setOpen] = useState(false);

  const form = useForm<UnitInput>({
    resolver: zodResolver(unitSchema),
    defaultValues: { name: '', kind: 'team' },
  });

  const create = useMutation({
    mutationFn: (values: UnitInput) => api.post('/units', values),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      setOpen(false);
      form.reset();
      void units.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const children = (parentId: string | null) =>
    (units.data ?? []).filter((unit) => unit.parentId === parentId);

  const renderTree = (parentId: string | null, depth = 0) =>
    children(parentId).map((unit) => (
      <li key={unit.id}>
        <div
          className="flex items-center gap-2 border-b border-border-subtle py-2"
          style={{ paddingInlineStart: `${depth * 1.25}rem` }}
        >
          <span className="font-medium">{unit.name}</span>
          <span className="text-xs text-ink-faint">{kindLabels[unit.kind]}</span>
        </div>
        <ul>{renderTree(unit.id, depth + 1)}</ul>
      </li>
    ));

  return (
    <>
      {can(Permissions.unitsWrite) ? (
        <Button
          className="mb-3"
          size="sm"
          icon={<Plus className="size-4" />}
          onClick={() => setOpen(true)}
        >
          {t('settings.addUnit')}
        </Button>
      ) : null}

      <QueryState
        isLoading={units.isLoading}
        error={units.error}
        isEmpty={(units.data ?? []).length === 0}
        onRetry={() => void units.refetch()}
      >
        <ul className="card p-3 text-sm">{renderTree(null)}</ul>
      </QueryState>

      <Dialog
        open={open}
        title={t('settings.addUnit')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('app.cancel')}
            </Button>
            <Button
              loading={create.isPending}
              onClick={() => void form.handleSubmit((values) => create.mutate(values))()}
            >
              {t('app.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('personnel.name')} error={form.formState.errors.name?.message} required>
            {({ id, required }) => (
              <Input aria-required={required} id={id} {...form.register('name')} />
            )}
          </Field>
          <Field label={t('assignments.category')}>
            {({ id }) => (
              <Select id={id} {...form.register('kind')}>
                {Object.entries(kindLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
          <Field label={t('settings.parentUnit')}>
            {({ id }) => (
              <Select id={id} {...form.register('parentId')}>
                <option value="">{t('app.none')}</option>
                {(units.data ?? []).map((unit) => (
                  <option key={unit.id} value={unit.id}>
                    {unit.name}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
      </Dialog>
    </>
  );
}
