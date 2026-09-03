import { useMutation } from '@tanstack/react-query';
import { Check, Undo2, X } from 'lucide-react';
import { formatRange } from '@shared/format';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { useToast } from '@/components/ui/toast-context';
import { useReplacements } from '@/hooks/queries';

/**
 * Somebody has named you as their cover.
 *
 * Before this the roster could put a person on a shift by an arrangement they
 * were never told about, which is exactly why the arrangement was being made
 * in the group chat instead. Neither answer here decides anything: agreeing
 * hands a settled arrangement to whoever approves it, and declining returns the
 * request to the pile — the person who asked still needs cover.
 */
export function MyReplacementsCard({
  personnelId,
  timezone,
}: {
  personnelId: string;
  timezone: string;
}) {
  const toast = useToast();
  const requests = useReplacements('open');

  const answer = useMutation({
    mutationFn: (input: { id: string; accept: boolean }) =>
      api.post(`/replacements/${input.id}/respond`, { accept: input.accept }),
    onSuccess: () => {
      toast.push('success', t('replacements.answered'));
      void requests.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => api.patch(`/replacements/${id}`, { status: 'cancelled' }),
    onSuccess: () => {
      toast.push('success', t('replacements.withdrawn'));
      void requests.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const open = requests.data ?? [];
  const askedOfMe = open.filter(
    (request) => request.replacementPersonnelId === personnelId && !request.acceptedAt,
  );
  const mine = open.filter((request) => request.personnelId === personnelId);
  if (askedOfMe.length === 0 && mine.length === 0) return null;

  const shift = (request: (typeof open)[number]) => (
    <>
      <p className="font-medium">{request.assignmentTitle}</p>
      <p className="ltr-inline mt-0.5 text-sm text-ink-muted">
        {formatRange(request.startAt, request.endAt, timezone)}
      </p>
    </>
  );

  return (
    <>
      {askedOfMe.length > 0 ? (
        <Card>
          <CardHeader
            title={t('replacements.askedOfYou')}
            description={t('replacements.askedOfYouHint')}
          />
          <ul className="flex flex-col gap-2">
            {askedOfMe.map((request) => (
              <li
                key={request.id}
                className="rounded-[var(--radius-control)] border border-border-subtle p-3"
              >
                {shift(request)}
                <p className="mt-1 text-sm text-ink-muted">
                  {request.personnelName}
                  {request.reason ? ` — ${request.reason}` : ''}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    icon={<Check className="size-4" />}
                    loading={answer.isPending}
                    onClick={() => answer.mutate({ id: request.id, accept: true })}
                  >
                    {t('replacements.accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<X className="size-4" />}
                    loading={answer.isPending}
                    onClick={() => answer.mutate({ id: request.id, accept: false })}
                  >
                    {t('replacements.decline')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {mine.length > 0 ? (
        <Card>
          {/* Plans change. Without this a request you no longer need stands
              until somebody notices, and the commander's screen fills with
              cover nobody is waiting for. */}
          <CardHeader title={t('replacements.mine')} description={t('replacements.mineHint')} />
          <ul className="flex flex-col gap-2">
            {mine.map((request) => (
              <li
                key={request.id}
                className="rounded-[var(--radius-control)] border border-border-subtle p-3"
              >
                {shift(request)}
                <p className="mt-1 text-sm text-ink-muted">
                  {request.replacementPersonnelName
                    ? `${request.replacementPersonnelName} — ${
                        request.acceptedAt
                          ? t('replacements.accepted')
                          : t('replacements.awaitingPeer')
                      }`
                    : t('replacements.awaitingCommander')}
                </p>
                <div className="mt-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={<Undo2 className="size-4" />}
                    loading={withdraw.isPending}
                    onClick={() => withdraw.mutate(request.id)}
                  >
                    {t('replacements.withdraw')}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
