import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { formatRange } from '@shared/format';
import { Permissions } from '@shared/rbac';
import type { ReplacementRequest, ReplacementStatus } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { usePersonnel, useReplacements } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

const statusLabels: Record<ReplacementStatus, string> = {
  pending: t('replacements.statusPending'),
  proposed: t('replacements.statusProposed'),
  approved: t('replacements.statusApproved'),
  rejected: t('replacements.statusRejected'),
  cancelled: t('replacements.statusCancelled'),
};

export function ReplacementsPage() {
  const { can } = useAuth();
  const toast = useToast();
  const replacements = useReplacements();
  const personnel = usePersonnel();
  const [selected, setSelected] = useState<Record<string, string>>({});

  const decide = useMutation({
    mutationFn: (input: {
      id: string;
      status: 'approved' | 'rejected';
      replacementPersonnelId?: string;
    }) =>
      api.patch(`/replacements/${input.id}`, {
        status: input.status,
        ...(input.replacementPersonnelId
          ? { replacementPersonnelId: input.replacementPersonnelId }
          : {}),
      }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void replacements.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const requests = replacements.data ?? [];
  const mayDecide = can(Permissions.replacementsDecide);

  const columns: Column<ReplacementRequest>[] = [
    {
      key: 'person',
      header: t('availability.person'),
      placement: 'title',
      cell: (request) => request.personnelName,
    },
    {
      key: 'assignment',
      header: t('assignments.name'),
      cell: (request) => (
        <>
          <span className="font-medium">{request.assignmentTitle}</span>
          <span className="ltr-inline block text-xs text-ink-faint">
            {formatRange(request.startAt, request.endAt)}
          </span>
        </>
      ),
    },
    { key: 'reason', header: t('replacements.reason'), cell: (request) => request.reason },
    {
      key: 'replacement',
      header: t('replacements.replacement'),
      cell: (request) =>
        request.replacementPersonnelName ??
        (mayDecide && request.status === 'pending' ? (
          <>
            <Select
              className="w-auto"
              aria-label={t('replacements.replacement')}
              value={selected[request.id] ?? ''}
              onChange={(event) =>
                setSelected((current) => ({ ...current, [request.id]: event.target.value }))
              }
            >
              <option value="">{t('app.none')}</option>
              {(personnel.data ?? [])
                .filter((person) => person.id !== request.personnelId)
                .map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.displayName}
                  </option>
                ))}
            </Select>
            {selected[request.id] ? null : (
              // The approve button is disabled until someone is picked, and a
              // disabled button cannot explain itself.
              <span className="mt-1 block text-xs text-ink-muted">
                {t('replacements.pickReplacement')}
              </span>
            )}
          </>
        ) : null),
    },
    {
      key: 'status',
      header: t('availability.status'),
      placement: 'badge',
      cell: (request) => (
        <Badge
          tone={
            request.status === 'approved'
              ? 'success'
              : request.status === 'rejected' || request.status === 'cancelled'
                ? 'neutral'
                : 'warning'
          }
        >
          {statusLabels[request.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('app.actions'),
      placement: 'actions',
      cell: (request) => {
        if (!mayDecide || request.status !== 'pending') return null;
        const replacementId = selected[request.id];
        return (
          <>
            <Button
              size="sm"
              icon={<Check className="size-4" />}
              disabled={!replacementId}
              title={replacementId ? undefined : t('replacements.pickReplacement')}
              onClick={() =>
                decide.mutate({
                  id: request.id,
                  status: 'approved',
                  replacementPersonnelId: replacementId as string,
                })
              }
            >
              {t('replacements.approve')}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              icon={<X className="size-4" />}
              onClick={() => decide.mutate({ id: request.id, status: 'rejected' })}
            >
              {t('replacements.reject')}
            </Button>
          </>
        );
      },
    },
  ];

  return (
    <>
      <PageHeader title={t('replacements.title')} description={t('replacements.subtitle')} />

      <div className="card p-0">
        <QueryState
          isLoading={replacements.isLoading}
          error={replacements.error}
          isEmpty={requests.length === 0}
          emptyDescription={t('replacements.empty')}
          onRetry={() => void replacements.refetch()}
        >
          <DataTable
            rows={requests}
            columns={columns}
            rowKey={(request) => request.id}
            caption={t('replacements.title')}
          />
        </QueryState>
      </div>
    </>
  );
}
