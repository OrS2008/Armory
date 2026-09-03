import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { CalendarPlus, Copy, Link2Off } from 'lucide-react';
import { formatDateTime } from '@shared/format';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Card, CardHeader } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';

/**
 * "When am I next on duty?" is a question the calendar already on the phone
 * answers better than we can: it is open anyway, it rings on its own, and it
 * keeps working when the app does not. So we publish rather than remind.
 *
 * The link is shown once, at the moment it is issued, because only its hash is
 * stored. Losing it and sharing it by mistake have the same answer — issue
 * another, which retires the one before it.
 */
export function CalendarFeedCard({ linked, timezone }: { linked: boolean; timezone: string }) {
  const toast = useToast();
  const [url, setUrl] = useState<string | null>(null);

  const feed = useQuery({
    enabled: linked,
    queryKey: ['me', 'calendar'],
    queryFn: () => api.get<{ subscribed: boolean; issuedAt: number | null }>('/me/calendar'),
  });

  const fail = (error: unknown) =>
    toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));

  const issue = useMutation({
    mutationFn: () => api.post<{ url: string; issuedAt: number }>('/me/calendar'),
    onSuccess: (result) => {
      setUrl(result.url);
      void feed.refetch();
    },
    onError: fail,
  });

  const revoke = useMutation({
    mutationFn: () => api.delete('/me/calendar'),
    onSuccess: () => {
      setUrl(null);
      toast.push('success', t('state.savedTitle'));
      void feed.refetch();
    },
    onError: fail,
  });

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast.push('success', t('me.calendarCopied'));
    } catch {
      // A phone can refuse the clipboard outright; the field is selectable and
      // saying nothing here would look like the button did nothing.
      toast.push('error', t('state.errorBody'));
    }
  };

  const subscribed = feed.data?.subscribed ?? false;

  return (
    <Card>
      <CardHeader title={t('me.calendar')} description={t('me.calendarIntro')} />

      {!linked ? (
        <p className="text-sm text-ink-muted">{t('me.calendarNotLinked')}</p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm text-ink-muted">
            {subscribed && feed.data?.issuedAt
              ? t('me.calendarIssuedAt', { date: formatDateTime(feed.data.issuedAt, timezone) })
              : t('me.calendarNone')}
          </p>

          {url ? (
            <div className="flex flex-col gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  readOnly
                  value={url}
                  dir="ltr"
                  className="min-w-0 flex-1"
                  aria-label={t('me.calendar')}
                />
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Copy className="size-4" />}
                  onClick={() => void copy()}
                >
                  {t('me.calendarCopy')}
                </Button>
              </div>
              <p className="text-xs text-warning">{t('me.calendarOnce')}</p>
              <p className="text-xs text-ink-faint">{t('me.calendarHow')}</p>
            </div>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon={<CalendarPlus className="size-4" />}
              loading={issue.isPending}
              onClick={() => issue.mutate()}
            >
              {subscribed ? t('me.calendarReissue') : t('me.calendarIssue')}
            </Button>
            {subscribed ? (
              <Button
                size="sm"
                variant="ghost"
                icon={<Link2Off className="size-4" />}
                loading={revoke.isPending}
                onClick={() => revoke.mutate()}
              >
                {t('me.calendarRevoke')}
              </Button>
            ) : null}
          </div>

          <p className="text-xs text-ink-faint">
            {t('me.calendarSecret')} {subscribed ? t('me.calendarReissueWarns') : null}
          </p>
        </div>
      )}
    </Card>
  );
}
