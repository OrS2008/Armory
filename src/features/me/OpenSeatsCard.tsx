import { useMutation } from '@tanstack/react-query';
import { HandHeart, Undo2 } from 'lucide-react';
import { formatRange } from '@shared/format';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { useOpenSeats, useVolunteers, type OpenSeat } from '@/hooks/queries';

/**
 * Seats nobody is standing, offered to somebody who could stand them.
 *
 * A shift short of people is a hole the commander is trying to fill, and
 * somebody free who would take it is the answer — but a soldier had no way of
 * seeing the hole, so the offer was made in the group chat or not at all.
 *
 * Every seat here has been put through the engine that would refuse the
 * assignment, so what is offered can actually be taken. Offering a shift the
 * roster would then refuse is worse than offering nothing.
 */
export function OpenSeatsCard({ linked, timezone }: { linked: boolean; timezone: string }) {
  const toast = useToast();
  const seats = useOpenSeats(linked);
  const offers = useVolunteers('offered');

  const fail = (error: unknown) =>
    toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));

  const refresh = () => {
    void seats.refetch();
    void offers.refetch();
  };

  const offer = useMutation({
    mutationFn: (seat: OpenSeat) =>
      api.post('/me/volunteer', {
        assignmentId: seat.assignmentId,
        ...(seat.role ? { role: seat.role } : {}),
        note: null,
      }),
    onSuccess: () => {
      toast.push('success', t('volunteers.offered'));
      refresh();
    },
    onError: fail,
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => api.delete(`/me/volunteer?id=${id}`),
    onSuccess: () => {
      toast.push('success', t('volunteers.withdrawn'));
      refresh();
    },
    onError: fail,
  });

  if (!linked) return null;
  const available = seats.data ?? [];
  const mine = offers.data ?? [];

  return (
    <>
      {mine.length > 0 ? (
        <Card>
          <CardHeader title={t('volunteers.myOffers')} />
          <ul className="flex flex-col gap-2">
            {mine.map((one) => (
              <li
                key={one.id}
                className="flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-border-subtle p-3"
              >
                <span className="font-medium">{one.assignmentTitle}</span>
                <span className="ltr-inline text-xs text-ink-muted">
                  {formatRange(one.startAt, one.endAt, timezone)}
                </span>
                <Button
                  className="ms-auto"
                  size="sm"
                  variant="ghost"
                  icon={<Undo2 className="size-4" />}
                  loading={withdraw.isPending}
                  onClick={() => withdraw.mutate(one.id)}
                >
                  {t('volunteers.withdraw')}
                </Button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card>
        <CardHeader title={t('volunteers.openSeats')} description={t('volunteers.openSeatsHint')} />
        {available.length === 0 ? (
          <p className="py-4 text-center text-sm text-ink-muted">
            {seats.isPending ? t('app.loading') : t('volunteers.none')}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {available.map((seat) => (
              <li
                key={`${seat.assignmentId}-${seat.role ?? 'plain'}`}
                className="rounded-[var(--radius-control)] border border-border-subtle p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{seat.title}</span>
                  <Badge tone="neutral">{seat.roleLabel ?? t('volunteers.plainSeat')}</Badge>
                </div>
                <p className="ltr-inline mt-0.5 text-sm text-ink-muted">
                  {formatRange(seat.startAt, seat.endAt, timezone)}
                  {seat.section ? ` · ${seat.section}` : ''}
                </p>
                <Button
                  className="mt-2"
                  size="sm"
                  variant="secondary"
                  icon={<HandHeart className="size-4" />}
                  loading={offer.isPending}
                  onClick={() => offer.mutate(seat)}
                >
                  {t('volunteers.offer')}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
