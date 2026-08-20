import { useMemo, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { availabilityKindLabels } from '@shared/messages.he';
import { Permissions } from '@shared/rbac';
import { formatDateTime } from '@shared/format';
import { DAY, startOfDay } from '@shared/time';
import type { AvailabilityKind } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { todayKey, toTimestamp } from '@/lib/datetime';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAvailability, usePersonnel } from '@/hooks/queries';
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

  return (
    <>
      <PageHeader
        title={t('availability.title')}
        actions={
          <>
            <Select
              className="w-auto"
              aria-label={t('availability.status')}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="">{t('app.all')}</option>
              <option value="pending">{t('availability.pending')}</option>
              <option value="approved">{t('availability.approved')}</option>
              <option value="rejected">{t('availability.rejected')}</option>
            </Select>
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
          isEmpty={(availability.data ?? []).length === 0}
          emptyDescription={t('availability.empty')}
          onRetry={() => void availability.refetch()}
        >
          <TableWrapper>
            <thead>
              <tr>
                <Th>{t('availability.person')}</Th>
                <Th>{t('availability.kind')}</Th>
                <Th>{t('availability.from')}</Th>
                <Th>{t('availability.to')}</Th>
                <Th>{t('availability.status')}</Th>
                <Th>{t('app.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {(availability.data ?? []).map((entry) => (
                <tr key={entry.id} className="hover:bg-surface-sunken">
                  <Td>{entry.personnelName}</Td>
                  <Td>{availabilityKindLabels[entry.kind]}</Td>
                  <Td className="ltr-inline">{formatDateTime(entry.startAt)}</Td>
                  <Td className="ltr-inline">{formatDateTime(entry.endAt)}</Td>
                  <Td>
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
                  </Td>
                  <Td>
                    {can(Permissions.availabilityApprove) && entry.status === 'pending' ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
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
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </QueryState>
      </div>

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
