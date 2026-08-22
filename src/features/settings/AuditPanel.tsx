import { formatDateTime } from '@shared/format';
import { auditActionLabel, auditEntityLabel } from '@shared/messages.he';
import type { AuditEvent } from '@shared/types';
import { t } from '@/i18n';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { useAuditEvents } from '@/hooks/queries';

function printValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value) ?? '';
}

/** Audit metadata holds identifiers and changed field names, never free text. */
function describeMetadata(metadata: Record<string, unknown>): string | null {
  const entries = Object.entries(metadata);
  if (entries.length === 0) return null;
  return entries.map(([key, value]) => `${key}: ${printValue(value)}`).join(' · ');
}

const columns: Column<AuditEvent>[] = [
  {
    key: 'time',
    header: t('audit.time'),
    className: 'ltr-inline whitespace-nowrap',
    cell: (event) => formatDateTime(event.createdAt),
  },
  {
    key: 'action',
    header: t('audit.action'),
    placement: 'title',
    cell: (event) => auditActionLabel(event.action),
  },
  { key: 'actor', header: t('audit.actor'), cell: (event) => event.actorName },
  {
    key: 'entity',
    header: t('audit.entity'),
    cell: (event) => (
      <>
        {auditEntityLabel(event.entityType)}
        <span className="ltr-inline block text-xs text-ink-faint">{event.entityId}</span>
      </>
    ),
  },
  {
    key: 'details',
    header: t('audit.details'),
    className: 'ltr-inline max-w-72 truncate text-xs text-ink-faint',
    cell: (event) => describeMetadata(event.metadata),
  },
];

export function AuditPanel() {
  const events = useAuditEvents({ limit: 150 });
  const rows = events.data ?? [];

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">{t('audit.immutable')}</p>
      <div className="card p-0">
        <QueryState
          isLoading={events.isLoading}
          error={events.error}
          isEmpty={rows.length === 0}
          emptyDescription={t('audit.empty')}
          onRetry={() => void events.refetch()}
        >
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(event) => event.id}
            caption={t('settings.audit')}
          />
        </QueryState>
      </div>
    </>
  );
}
