import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { qualificationSchema, type QualificationInput } from '@shared/schemas';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Textarea } from '@/components/ui/Input';
import { TableWrapper, Td, Th } from '@/components/ui/Table';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useQualifications } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

export function QualificationsPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const qualifications = useQualifications();
  const [open, setOpen] = useState(false);

  const form = useForm<QualificationInput>({
    resolver: zodResolver(qualificationSchema),
    defaultValues: { code: '', name: '' },
  });

  const create = useMutation({
    mutationFn: (values: QualificationInput) => api.post('/qualifications', values),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      setOpen(false);
      form.reset();
      void qualifications.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  return (
    <>
      {can(Permissions.qualificationsWrite) ? (
        <Button
          className="mb-3"
          size="sm"
          icon={<Plus className="size-4" />}
          onClick={() => setOpen(true)}
        >
          {t('settings.addQualification')}
        </Button>
      ) : null}

      <div className="card p-0">
        <QueryState
          isLoading={qualifications.isLoading}
          error={qualifications.error}
          isEmpty={(qualifications.data ?? []).length === 0}
          onRetry={() => void qualifications.refetch()}
        >
          <TableWrapper>
            <thead>
              <tr>
                <Th>{t('settings.code')}</Th>
                <Th>{t('personnel.name')}</Th>
                <Th>{t('personnel.status')}</Th>
              </tr>
            </thead>
            <tbody>
              {(qualifications.data ?? []).map((qualification) => (
                <tr key={qualification.id}>
                  <Td className="ltr-inline">{qualification.code}</Td>
                  <Td>{qualification.name}</Td>
                  <Td>
                    <Badge tone={qualification.active ? 'success' : 'neutral'}>
                      {qualification.active
                        ? t('personnel.statusActive')
                        : t('personnel.statusInactive')}
                    </Badge>
                  </Td>
                </tr>
              ))}
            </tbody>
          </TableWrapper>
        </QueryState>
      </div>

      <Dialog
        open={open}
        title={t('settings.addQualification')}
        onClose={() => setOpen(false)}
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>
              {t('app.cancel')}
            </Button>
            <Button
              loading={create.isPending}
              onClick={() => void form.handleSubmit((values) => create.mutate(values))()}
            >
              {t('app.save')}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label={t('settings.code')} error={form.formState.errors.code?.message} required>
            {({ id, required }) => (
              <Input aria-required={required} id={id} dir="ltr" {...form.register('code')} />
            )}
          </Field>
          <Field label={t('personnel.name')} error={form.formState.errors.name?.message} required>
            {({ id, required }) => (
              <Input aria-required={required} id={id} {...form.register('name')} />
            )}
          </Field>
          <Field label={t('audit.details')}>
            {({ id }) => <Textarea id={id} {...form.register('description')} />}
          </Field>
        </div>
      </Dialog>
    </>
  );
}
