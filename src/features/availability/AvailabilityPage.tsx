import { useMemo, useState } from 'react';
import { Check, FileUp, Pencil, Plus, Trash2, X } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { availabilityKindLabels } from '@shared/messages.he';
import { Permissions } from '@shared/rbac';
import { formatRange } from '@shared/format';
import { DAY, startOfDay } from '@shared/time';
import type { Availability } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { todayKey } from '@/lib/datetime';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAvailability } from '@/hooks/queries';
import { AvailabilityFormDialog } from './AvailabilityFormDialog';
import { AvailabilityImportDialog } from './AvailabilityImportDialog';
import { useAuth } from '@/hooks/auth-context';

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
  const [editing, setEditing] = useState<Availability | null>(null);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState('');

  const dateWindow = useMemo(() => {
    const from = startOfDay(todayKey()) - 7 * DAY;
    return { from, to: from + RANGE_DAYS * DAY, ...(status ? { status } : {}) };
  }, [status]);

  const availability = useAvailability(dateWindow);
  const mayManage = can(Permissions.availabilityWrite);

  // A soldier may still fix their own request while nobody has decided it yet;
  // once it is approved or rejected, changing it is a scheduler's call.
  const mayEdit = (entry: Availability) =>
    mayManage || (entry.personnelId === user?.personnelId && entry.status === 'pending');

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

  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/availability/${id}`),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
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
      cell: (entry) => (
        <>
          {can(Permissions.availabilityApprove) && entry.status === 'pending' ? (
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
          ) : null}
          {mayEdit(entry) ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<Pencil className="size-4" />}
                onClick={() => setEditing(entry)}
              >
                {t('availability.edit')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash2 className="size-4" />}
                onClick={() => {
                  if (
                    window.confirm(
                      t('availability.deleteConfirm', {
                        kind: availabilityKindLabels[entry.kind],
                        name: entry.personnelName ?? '',
                      }),
                    )
                  ) {
                    remove.mutate(entry.id);
                  }
                }}
              >
                {t('availability.delete')}
              </Button>
            </>
          ) : null}
        </>
      ),
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

      <AvailabilityFormDialog
        open={creating || editing !== null}
        entry={editing}
        defaultPersonnelId={user?.personnelId ?? ''}
        mayManage={mayManage}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void availability.refetch()}
      />
    </>
  );
}
