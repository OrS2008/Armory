import { useMutation } from '@tanstack/react-query';
import { Check, X } from 'lucide-react';
import { formatRange } from '@shared/format';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { EmptyState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useAuth } from '@/hooks/auth-context';
import { useQualifications, useVolunteers } from '@/hooks/queries';

/**
 * A hole in tomorrow's sheet and somebody willing to fill it are two halves of
 * the same fact, and they used to live in different places — the hole on the
 * board, the offer in a chat nobody reads twice.
 *
 * Accepting writes the assignment, through the same gate as any other: the
 * offer was checked when it was made, but a week can pass between the offer
 * and the answer and what was true then need not be now.
 */
export function VolunteersCard() {
  const { can } = useAuth();
  const toast = useToast();
  const offers = useVolunteers('offered');
  const qualifications = useQualifications();

  const decide = useMutation({
    mutationFn: (input: { id: string; status: 'accepted' | 'declined' }) =>
      api.patch(`/volunteers/${input.id}`, { status: input.status }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void offers.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const mayDecide = can(Permissions.assignmentsAssign);
  const rows = offers.data ?? [];
  const names = new Map((qualifications.data ?? []).map((one) => [one.id, one.name]));

  return (
    <Card>
      <CardHeader title={t('volunteers.title')} description={t('volunteers.hint')} />
      {rows.length === 0 ? (
        <EmptyState description={t('volunteers.empty')} />
      ) : (
        <ul className="flex flex-col divide-y divide-border-subtle">
          {rows.map((offer) => (
            <li key={offer.id} className="flex flex-wrap items-center gap-2 py-3">
              <div className="min-w-0 flex-1">
                <p className="font-medium">
                  {offer.personnelName}
                  <span className="text-ink-muted"> — {offer.assignmentTitle}</span>
                </p>
                <p className="ltr-inline text-xs text-ink-muted">
                  {formatRange(offer.startAt, offer.endAt)}
                </p>
                {offer.note ? <p className="mt-1 text-sm text-ink-muted">{offer.note}</p> : null}
              </div>
              <Badge tone="neutral">
                {offer.roleQualificationId
                  ? (names.get(offer.roleQualificationId) ?? offer.roleQualificationId)
                  : t('volunteers.plainSeat')}
              </Badge>
              {mayDecide ? (
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    icon={<Check className="size-4" />}
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ id: offer.id, status: 'accepted' })}
                  >
                    {t('volunteers.accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X className="size-4" />}
                    loading={decide.isPending}
                    onClick={() => decide.mutate({ id: offer.id, status: 'declined' })}
                  >
                    {t('volunteers.decline')}
                  </Button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
