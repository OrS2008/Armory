import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileUp, Pencil, Plus, Search, UserMinus } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import type { Personnel } from '@shared/types';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Input, Select } from '@/components/ui/Input';
import { DataTable, type Column } from '@/components/ui/DataTable';
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
  // The query lives in the URL, so a search can be linked to and so the
  // command palette can land here already filtered to one person.
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const setSearch = (value: string) => setParams(value ? { q: value } : {}, { replace: true });
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
  const filtered = Boolean(search || unitId || qualificationId);
  const clearFilters = () => {
    setSearch('');
    setUnitId('');
    setQualificationId('');
  };

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

  const people = personnel.data ?? [];

  const columns: Column<Personnel>[] = [
    {
      key: 'name',
      header: t('personnel.name'),
      placement: 'title',
      cell: (person) => (
        <>
          <span className="font-medium">{person.displayName}</span>
          {person.externalId ? (
            <span className="ltr-inline block text-xs text-ink-faint">{person.externalId}</span>
          ) : null}
        </>
      ),
    },
    { key: 'unit', header: t('personnel.unit'), cell: (person) => person.unitName },
    { key: 'role', header: t('personnel.roleTitle'), cell: (person) => person.roleTitle },
    {
      key: 'qualifications',
      header: t('personnel.qualifications'),
      cell: (person) =>
        person.qualificationIds.length === 0 ? null : (
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
        ),
    },
    {
      key: 'status',
      header: t('personnel.status'),
      placement: 'badge',
      cell: (person) => (
        <Badge tone={person.status === 'active' ? 'success' : 'neutral'}>
          {statusLabels[person.status]}
        </Badge>
      ),
    },
    {
      key: 'actions',
      header: t('app.actions'),
      placement: 'actions',
      cell: (person) =>
        can(Permissions.personnelWrite) ? (
          <>
            <Button
              variant="secondary"
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
                  if (window.confirm(t('personnel.archiveConfirm', { name: person.displayName }))) {
                    archive.mutate(person.id);
                  }
                }}
              >
                {t('personnel.archive')}
              </Button>
            ) : null}
          </>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader
        title={t('personnel.title')}
        description={t('personnel.subtitle')}
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

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:min-w-56 sm:flex-1">
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
        {(units.data ?? []).length > 1 ? (
          <Select
            className="w-auto"
            aria-label={t('personnel.unit')}
            value={unitId}
            onChange={(event) => setUnitId(event.target.value)}
          >
            <option value="">{t('personnel.allUnits')}</option>
            {(units.data ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </Select>
        ) : null}
        {(qualifications.data ?? []).length > 0 ? (
          <Select
            className="w-auto"
            aria-label={t('personnel.qualifications')}
            value={qualificationId}
            onChange={(event) => setQualificationId(event.target.value)}
          >
            <option value="">{t('personnel.allQualifications')}</option>
            {(qualifications.data ?? []).map((qualification) => (
              <option key={qualification.id} value={qualification.id}>
                {qualification.name}
              </option>
            ))}
          </Select>
        ) : null}
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            {t('app.clearFilters')}
          </Button>
        ) : null}
        {people.length > 0 ? (
          <span className="ms-auto text-xs text-ink-muted">
            {people.length === 1
              ? t('personnel.countOne')
              : t('personnel.count', { count: people.length })}
          </span>
        ) : null}
      </div>

      <div className="card p-0">
        <QueryState
          isLoading={personnel.isLoading}
          error={personnel.error}
          isEmpty={people.length === 0}
          emptyDescription={filtered ? t('personnel.empty') : t('personnel.emptyAll')}
          onRetry={() => void personnel.refetch()}
        >
          <DataTable
            rows={people}
            columns={columns}
            rowKey={(person) => person.id}
            caption={t('personnel.title')}
          />
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
