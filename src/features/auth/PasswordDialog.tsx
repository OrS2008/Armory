import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { passwordChangeSchema, type PasswordChangeInput } from '@shared/schemas';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';

/** A person changing their own password. Other devices are signed out. */
export function PasswordDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast();
  const form = useForm<PasswordChangeInput>({
    resolver: zodResolver(passwordChangeSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });

  const change = useMutation({
    mutationFn: (values: PasswordChangeInput) => api.post('/auth/password', values),
    onSuccess: () => {
      toast.push('success', t('account.passwordChanged'));
      form.reset();
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        form.setError('currentPassword', { message: error.message });
      } else {
        toast.push('error', t('state.errorBody'));
      }
    },
  });

  return (
    <Dialog
      open={open}
      title={t('account.changePassword')}
      description={t('account.passwordHint')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            loading={change.isPending}
            onClick={() => void form.handleSubmit((values) => change.mutate(values))()}
          >
            {t('app.save')}
          </Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(event) => event.preventDefault()}>
        <Field
          label={t('account.currentPassword')}
          error={form.formState.errors.currentPassword?.message}
          required
        >
          {({ id, required }) => (
            <Input
              id={id}
              type="password"
              dir="ltr"
              autoComplete="current-password"
              aria-required={required}
              {...form.register('currentPassword')}
            />
          )}
        </Field>
        <Field
          label={t('account.newPassword')}
          error={form.formState.errors.newPassword?.message}
          required
        >
          {({ id, required }) => (
            <Input
              id={id}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              aria-required={required}
              {...form.register('newPassword')}
            />
          )}
        </Field>
        <Field
          label={t('account.confirmPassword')}
          error={form.formState.errors.confirmPassword?.message}
          required
        >
          {({ id, required }) => (
            <Input
              id={id}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              aria-required={required}
              {...form.register('confirmPassword')}
            />
          )}
        </Field>
      </form>
    </Dialog>
  );
}
