import { useMutation } from '@tanstack/react-query';
import { CheckCheck } from 'lucide-react';
import { formatDateTime } from '@shared/format';
import { t } from '@/i18n';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { QueryState } from '@/components/ui/States';
import { PageHeader } from '@/components/layout/PageHeader';
import { useNotifications } from '@/hooks/queries';

export function NotificationsPage() {
  const notifications = useNotifications();
  const markAll = useMutation({
    mutationFn: () => api.post('/notifications/read'),
    onSuccess: () => void notifications.refetch(),
  });

  const items = notifications.data?.notifications ?? [];
  const unread = notifications.data?.unreadCount ?? 0;

  return (
    <>
      <PageHeader
        title={t('notifications.title')}
        description={t('notifications.subtitle')}
        {...(unread > 0 ? { description: t('notifications.unread', { count: unread }) } : {})}
        actions={
          unread > 0 ? (
            <Button
              variant="secondary"
              size="sm"
              icon={<CheckCheck className="size-4" />}
              loading={markAll.isPending}
              onClick={() => markAll.mutate()}
            >
              {t('notifications.markAllRead')}
            </Button>
          ) : null
        }
      />

      <QueryState
        isLoading={notifications.isLoading}
        error={notifications.error}
        isEmpty={items.length === 0}
        emptyDescription={t('notifications.empty')}
        onRetry={() => void notifications.refetch()}
      >
        <ul className="flex flex-col gap-2">
          {items.map((notification) => (
            <li
              key={notification.id}
              className={cn(
                'card flex flex-col gap-1 p-3',
                notification.readAt === null ? 'border-brand-200 bg-brand-50' : '',
              )}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{notification.title}</span>
                <span className="ltr-inline ms-auto text-xs text-ink-faint">
                  {formatDateTime(notification.createdAt)}
                </span>
              </div>
              {notification.body ? (
                <p className="text-sm text-ink-muted">{notification.body}</p>
              ) : null}
            </li>
          ))}
        </ul>
      </QueryState>
    </>
  );
}
