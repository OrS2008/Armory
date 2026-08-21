import { useState } from 'react';
import { FileUp, Pencil, Plus, Search, UserMinus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { Personnel } from '@shared/types';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { PageHeader } from '@/components/layout/PageHeader';
import { usePersonnel, useQualifications, useUnits } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';
import { ImportDialog } from './ImportDialog';
import { PersonnelFormDialog } from './PersonnelFormDialog';

const statusLabels: Record<Personnel['status'], string> = {
  active: t('personnel.statusActive'),
  inactive: t('personnel.statusInactive'),
  archived: t('personnel.statusArchived'),
};

export function PersonnelPage() {
  const { can } = useAuth();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [unitId, setUnitId] = useState('');
  const [qualificationId, setQualificationId] = useState('');
  const [editing, setEditing] = useState<Personnel | null>(null);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);

  const units = useUnits();
  const qualifications = useQualifications();
  const filters = {
    ...(search ? { q: search } : {}),
    ...(unitId ? { unitId } : {}),
    ...(qualificationId ? { qualificationId } : {}),
  };
  const personnel = usePersonnel(filters);

  const archive = useMutation({
    mutationFn: (id: string) => api.delete(`/personnel/${id}`),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void personnel.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const qualificationName = (id: string) =>
    qualifications.data?.find((item) => item.id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title={t('personnel.title')}
        actions={
          can(Permissions.personnelWrite) ? (
            <>
              <Button
                variant="secondary"
                size="sm"
                icon={<FileUp className="size-4" />}
                onClick={() => setImporting(true)}
              >
                {t('personnel.import')}
              </Button>
              <Button
                size="sm"
                icon={<Plus className="size-4" />}
                onClick={() => setCreating(true)}
              >
                {t('personnel.add')}
              </Button>
            </>
          ) : null
        }
      />

      <div className="mb-4 flex flex-wrap gap-2">
        <div className="relative min-w-56 flex-1">
          <Search
            className="pointer-events-none absolute inset-y-0 end-3 my-auto size-4 text-ink-faint"
            aria-hidden
          />
          <Input
            className="pe-9"
            placeholder={t('personnel.searchPlaceholder')}
            aria-label={t('app.search')}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <Select
          className="w-auto"
          aria-label={t('personnel.unit')}
          value={unitId}
          onChange={(event) => setUnitId(event.target.value)}
        >
          <option value="">{t('app.all')}</option>
          {(units.data ?? []).map((unit) => (
            <option key={unit.id} value={unit.id}>
              {unit.name}
            </option>
          ))}
        </Select>
        <Select
          className="w-auto"
          aria-label={t('personnel.qualifications')}
          value={qualificationId}
          onChange={(event) => setQualificationId(event.target.value)}
        >
          <option value="">{t('app.all')}</option>
          {(qualifications.data ?? []).map((qualification) => (
            <option key={qualification.id} value={qualification.id}>
              {qualification.name}
            </option>
          ))}
        </Select>
      </div>

      <div className="card p-0">
        <QueryState
          isLoading={personnel.isLoading}
          error={personnel.error}
          isEmpty={(personnel.data ?? []).length === 0}
          emptyDescription={t('personnel.empty')}
          onRetry={() => void personnel.refetch()}
        >
          <TableWrapper>
            <thead>
              <tr>
                <Th>{t('personnel.name')}</Th>
                <Th>{t('personnel.unit')}</Th>
                <Th>{t('personnel.roleTitle')}</Th>
                <Th>{t('personnel.qualifications')}</Th>
                <Th>{t('personnel.status')}</Th>
                <Th>{t('app.actions')}</Th>
              </tr>
            </thead>
            <tbody>
              {(personnel.data ?? []).map((person) => (
                <tr key={person.id} className="hover:bg-surface-sunken">
                  <Td>
                    <span className="font-medium">{person.displayName}</span>
                    {person.externalId ? (
                      <span className="ltr-inline block text-xs text-ink-faint">
                        {person.externalId}
                      </span>
                    ) : null}
                  </Td>
                  <Td>{person.unitName ?? '—'}</Td>
                  <Td>{person.roleTitle ?? '—'}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {person.qualificationIds.slice(0, 3).map((id) => (
                        <Badge key={id} tone="brand">
                          {qualificationName(id)}
                        </Badge>
                      ))}
                      {person.qualificationIds.length > 3 ? (
                        <Badge>+{person.qualificationIds.length - 3}</Badge>
                      ) : null}
                    </div>
                  </Td>
                  <Td>
                    <Badge tone={person.status === 'active' ? 'success' : 'neutral'}>
                      {statusLabels[person.status]}
                    </Badge>
                  </Td>
                  <Td>
                    {can(Permissions.personnelWrite) ? (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          icon={<Pencil className="size-4" />}
                          onClick={() => setEditing(person)}
                        >
                          {t('personnel.edit')}
                        </Button>
                        {person.status !== 'archived' ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            icon={<UserMinus className="size-4" />}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t('personnel.archiveConfirm', { name: person.displayName }),
                                )
                              ) {
                                archive.mutate(person.id);
                              }
                            }}
                          >
                            {t('personnel.archive')}
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </QueryState>
      </div>

      <ImportDialog
        open={importing}
        onClose={() => setImporting(false)}
        onImported={() => void personnel.refetch()}
      />

      <PersonnelFormDialog
        open={creating || editing !== null}
        person={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
        onSaved={() => void personnel.refetch()}
      />
    </>
  );
}
