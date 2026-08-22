import { useState } from 'react';
import { Pencil, Plus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { formatDateTime } from '@shared/format';
import { roleLabels } from '@shared/messages.he';
import { Permissions } from '@shared/rbac';
import type { AdminUser } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { DataTable, type Column } from '@/components/ui/DataTable';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useUsers } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';
import { UserFormDialog } from './UserFormDialog';

export function UsersPanel() {
  const { user: me, can } = useAuth();
  const toast = useToast();
  const mayManage = can(Permissions.usersManage);
  const users = useUsers(mayManage);
  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [creating, setCreating] = useState(false);

  const rows = users.data ?? [];

  const setActive = useMutation({
    mutationFn: (input: { id: string; active: boolean }) =>
      api.patch(`/users/${input.id}`, { active: input.active }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void users.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const resetMfa = useMutation({
    mutationFn: (id: string) => api.patch(`/users/${id}`, { mfaEnabled: false }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void users.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const columns: Column<AdminUser>[] = [
    {
      key: 'name',
      header: t('personnel.name'),
      placement: 'title',
      cell: (row) => (
        <>
          <span>{row.displayName}</span>
          {row.id === me?.id ? (
            <span className="ms-2 text-xs font-normal text-ink-faint">
              {t('settings.userSelf')}
            </span>
          ) : null}
          <span className="ltr-inline block text-xs text-ink-faint">{row.email}</span>
        </>
      ),
    },
    { key: 'role', header: t('settings.userRole'), cell: (row) => roleLabels[row.role] },
    {
      key: 'personnel',
      header: t('settings.userPersonnel'),
      cell: (row) => row.personnelName,
    },
    {
      key: 'scope',
      header: t('settings.userScope'),
      cell: (row) =>
        row.unitScope.length === 0
          ? t('settings.userScopeAll')
          : t('settings.userScopeCount', { count: row.unitScope.length }),
    },
    {
      key: 'lastLogin',
      header: t('settings.userLastLogin'),
      className: 'ltr-inline whitespace-nowrap',
      cell: (row) =>
        row.lastLoginAt === null ? (
          <span className="text-ink-faint">{t('settings.userNeverLoggedIn')}</span>
        ) : (
          formatDateTime(row.lastLoginAt)
        ),
    },
    {
      key: 'status',
      header: t('personnel.status'),
      placement: 'badge',
      cell: (row) => (
        <>
          {row.mfaEnabled ? <Badge tone="success">{t('settings.userMfa')}</Badge> : null}
          {row.active ? null : <Badge tone="neutral">{t('settings.userInactive')}</Badge>}
        </>
      ),
    },
    {
      key: 'actions',
      header: t('app.actions'),
      placement: 'actions',
      cell: (row) => (
        <>
          <Button
            variant="secondary"
            size="sm"
            icon={<Pencil className="size-4" />}
            onClick={() => setEditing(row)}
          >
            {t('personnel.edit')}
          </Button>
          {row.mfaEnabled ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                if (window.confirm(t('mfa.resetConfirm', { name: row.displayName }))) {
                  resetMfa.mutate(row.id);
                }
              }}
            >
              {t('mfa.reset')}
            </Button>
          ) : null}
          {row.id === me?.id ? null : (
            <Button
              variant="ghost"
              size="sm"
              loading={setActive.isPending}
              onClick={() => setActive.mutate({ id: row.id, active: !row.active })}
            >
              {row.active ? t('settings.userDeactivate') : t('settings.userActivate')}
            </Button>
          )}
        </>
      ),
    },
  ];

  return (
    <>
      <p className="mb-3 text-sm text-ink-muted">{t('settings.usersHint')}</p>
      <Button
        className="mb-3"
        size="sm"
        icon={<Plus className="size-4" />}
        onClick={() => setCreating(true)}
      >
        {t('settings.addUser')}
      </Button>

      <div className="card p-0">
        <QueryState
          isLoading={users.isLoading}
          error={users.error}
          isEmpty={rows.length === 0}
          emptyDescription={t('settings.usersEmpty')}
          onRetry={() => void users.refetch()}
        >
          <DataTable
            rows={rows}
            columns={columns}
            rowKey={(row) => row.id}
            caption={t('settings.users')}
          />
        </QueryState>
      </div>

      <UserFormDialog
        key={editing?.id ?? 'new'}
        open={creating || editing !== null}
        user={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void users.refetch()}
      />
    </>
  );
}
