import { formatDateTime } from '@shared/format';
import { t } from '@/i18n';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { QueryState } from '@/components/ui/States';
import { useAuditEvents } from '@/hooks/queries';

export function AuditPanel() {
  const events = useAuditEvents({ limit: 150 });

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">{t('audit.immutable')}</p>
      <div className="card p-0">
        <QueryState
          isLoading={events.isLoading}
          error={events.error}
          isEmpty={(events.data ?? []).length === 0}
          emptyDescription={t('audit.empty')}
          onRetry={() => void events.refetch()}
        >
          <TableWrapper>
            <thead>
              <tr>
                <Th>{t('audit.time')}</Th>
                <Th>{t('audit.actor')}</Th>
                <Th>{t('audit.action')}</Th>
                <Th>{t('audit.entity')}</Th>
                <Th>{t('audit.details')}</Th>
              </tr>
            </thead>
            <tbody>
              {(events.data ?? []).map((event) => (
                <tr key={event.id} className="hover:bg-surface-sunken">
                  <Td className="ltr-inline whitespace-nowrap">
                    {formatDateTime(event.createdAt)}
                  </Td>
                  <Td>{event.actorName}</Td>
                  <Td className="ltr-inline">{event.action}</Td>
                  <Td className="ltr-inline text-xs text-ink-muted">
                    {event.entityType}/{event.entityId}
                  </Td>
                  <Td className="ltr-inline max-w-72 truncate text-xs text-ink-faint">
                    {JSON.stringify(event.metadata)}
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
