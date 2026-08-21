import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { formatRange } from '@shared/format';
import { Permissions } from '@shared/rbac';
import type { ReplacementStatus } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
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

  return (
    <>
      <PageHeader title={t('replacements.title')} description={t('replacements.subtitle')} />

      <div className="card p-0">
        <QueryState
          isLoading={replacements.isLoading}
          error={replacements.error}
          isEmpty={(replacements.data ?? []).length === 0}
          emptyDescription={t('replacements.empty')}
          onRetry={() => void replacements.refetch()}
        >
          <TableWrapper>
            <thead>
              <tr>
                <Th>{t('availability.person')}</Th>
                <Th>{t('assignments.name')}</Th>
                <Th>{t('replacements.reason')}</Th>
                <Th>{t('replacements.replacement')}</Th>
                <Th>{t('availability.status')}</Th>
                <Th>{t('app.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {(replacements.data ?? []).map((request) => (
                <tr key={request.id} className="hover:bg-surface-sunken">
                  <Td>{request.personnelName}</Td>
                  <Td>
                    <span className="font-medium">{request.assignmentTitle}</span>
                    <span className="ltr-inline block text-xs text-ink-faint">
                      {formatRange(request.startAt, request.endAt)}
                    </span>
                  </Td>
                  <Td>{request.reason ?? '—'}</Td>
                  <Td>
                    {request.replacementPersonnelName ??
                      (can(Permissions.replacementsDecide) && request.status === 'pending' ? (
                        <Select
                          className="w-auto"
                          aria-label={t('replacements.replacement')}
                          value={selected[request.id] ?? ''}
                          onChange={(event) =>
                            setSelected((current) => ({
                              ...current,
                              [request.id]: event.target.value,
                            }))
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
                      ) : (
                        '—'
                      ))}
                  </Td>
                  <Td>
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
                  </Td>
                  <Td>
                    {can(Permissions.replacementsDecide) && request.status === 'pending' ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Check className="size-4" />}
                          disabled={!selected[request.id]}
                          onClick={() =>
                            decide.mutate({
                              id: request.id,
                              status: 'approved',
                              replacementPersonnelId: selected[request.id] as string,
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
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </QueryState>
      </div>
    </>
  );
}
