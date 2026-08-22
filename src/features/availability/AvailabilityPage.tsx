import { useMemo, useState } from 'react';
import { Check, FileUp, Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { availabilityKindLabels } from '@shared/messages.he';
import { Permissions } from '@shared/rbac';
import { formatRange } from '@shared/format';
import { DAY, startOfDay } from '@shared/time';
import type { Availability, AvailabilityKind } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { todayKey, toTimestamp } from '@/lib/datetime';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAvailability, usePersonnel } from '@/hooks/queries';
import { AvailabilityImportDialog } from './AvailabilityImportDialog';
import { useAuth } from '@/hooks/auth-context';

interface FormValues {
  personnelId: string;
  kind: AvailabilityKind;
  fromDay: string;
  fromTime: string;
  toDay: string;
  toTime: string;
  reason: string;
}

const RANGE_DAYS = 30;

const statusLabels = {
  pending: t('availability.pending'),
  approved: t('availability.approved'),
  rejected: t('availability.rejected'),
} as const;

export function AvailabilityPage() {
  const { user, can } = useAuth();
  const toast = useToast();
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');

  const window = useMemo(() => {
    const from = startOfDay(todayKey()) - 7 * DAY;
    return { from, to: from + RANGE_DAYS * DAY, ...(status ? { status } : {}) };
  }, [status]);

  const availability = useAvailability(window);
  const personnel = usePersonnel();
  const mayManage = can(Permissions.availabilityWrite);

  const form = useForm<FormValues>({
    defaultValues: {
      personnelId: user?.personnelId ?? '',
      kind: 'leave',
      fromDay: todayKey(),
      fromTime: '00:00',
      toDay: todayKey(),
      toTime: '23:59',
      reason: '',
    },
  });

  const decide = useMutation({
    mutationFn: (input: { id: string; status: 'approved' | 'rejected' }) =>
      api.patch(`/availability/${input.id}`, { status: input.status }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void availability.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const create = useMutation({
    mutationFn: (values: FormValues) =>
      api.post('/availability', {
        personnelId: values.personnelId,
        kind: values.kind,
        startAt: toTimestamp(values.fromDay, values.fromTime),
        endAt: toTimestamp(values.toDay, values.toTime),
        reason: values.reason || null,
      }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      setCreating(false);
      form.reset();
      void availability.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const entries = availability.data ?? [];

  const columns: Column<Availability>[] = [
    {
      key: 'person',
      header: t('availability.person'),
      placement: 'title',
      cell: (entry) => entry.personnelName,
    },
    {
      key: 'kind',
      header: t('availability.kind'),
      cell: (entry) => availabilityKindLabels[entry.kind],
    },
    {
      key: 'range',
      header: t('availability.range'),
      className: 'ltr-inline',
      cell: (entry) => formatRange(entry.startAt, entry.endAt),
    },
    { key: 'reason', header: t('availability.reason'), cell: (entry) => entry.reason },
    {
      key: 'status',
      header: t('availability.status'),
      placement: 'badge',
      cell: (entry) => (
        <Badge
          tone={
            entry.status === 'approved'
              ? 'success'
              : entry.status === 'rejected'
                ? 'danger'
                : 'warning'
          }
        >
          {statusLabels[entry.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('app.actions'),
      placement: 'actions',
      cell: (entry) =>
        can(Permissions.availabilityApprove) && entry.status === 'pending' ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              icon={<Check className="size-4" />}
              onClick={() => decide.mutate({ id: entry.id, status: 'approved' })}
            >
              {t('availability.approve')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="size-4" />}
              onClick={() => decide.mutate({ id: entry.id, status: 'rejected' })}
            >
              {t('availability.reject')}
            </Button>
          </>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('availability.title')}
        description={t('availability.subtitle')}
        actions={
          <>
            <Select
              className="w-auto"
              aria-label={t('availability.status')}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t('availability.allStatuses')}</option>
              <option value="pending">{t('availability.pending')}</option>
              <option value="approved">{t('availability.approved')}</option>
              <option value="rejected">{t('availability.rejected')}</option>
            </Select>
            {mayManage ? (
              <Button
                variant="secondary"
                size="sm"
                icon={<FileUp className="size-4" />}
                onClick={() => setImporting(true)}
              >
                {t('availability.import')}
              </Button>
            ) : null}
            <Button size="sm" icon={<Plus className="size-4" />} onClick={() => setCreating(true)}>
              {mayManage ? t('availability.add') : t('availability.request')}
            </Button>
          </>
        }
      />

      <div className="card p-0">
        <QueryState
          isLoading={availability.isLoading}
          error={availability.error}
          isEmpty={entries.length === 0}
          emptyDescription={t('availability.empty')}
          onRetry={() => void availability.refetch()}
        >
          <DataTable
            rows={entries}
            columns={columns}
            rowKey={(entry) => entry.id}
            caption={t('availability.title')}
          />
        </QueryState>
      </div>

      {importing ? (
        <AvailabilityImportDialog
          open
          onClose={() => setImporting(false)}
          onImported={() => void availability.refetch()}
        />
      ) : null}

      <Dialog
        open={creating}
        title={mayManage ? t('availability.add') : t('availability.request')}
        onClose={() => setCreating(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreating(false)}>
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
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
          <Field label={t('availability.person')} className="sm:col-span-2">
            {({ id }) => (
              <Select id={id} disabled={!mayManage} {...form.register('personnelId')}>
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
    </>
  );
}
