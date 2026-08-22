import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation } from '@tanstack/react-query';
import { roleDescriptions, roleLabels } from '@shared/messages.he';
import { userPatchSchema, userSchema, type UserPatchInput, type UserInput } from '@shared/schemas';
import type { AdminUser, Role } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input, Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { usePersonnel, useUnits } from '@/hooks/queries';

const ROLES: Role[] = ['system_admin', 'company_commander', 'unit_scheduler', 'soldier', 'viewer'];

interface Props {
  open: boolean;
  user: AdminUser | null;
  onClose: () => void;
  onSaved: () => void;
}

/**
 * One dialog for both acts. Creating asks for a password; editing leaves it
 * blank, because "no new password" and "an empty password" must not look the
 * same to whoever is typing.
 */
export function UserFormDialog({ open, user, onClose, onSaved }: Props) {
  const toast = useToast();
  const units = useUnits();
  const personnel = usePersonnel();
  const editing = user !== null;
  // Seeded from the account this dialog was opened for. UsersPanel keys the
  // dialog by that account, so switching to another one remounts with its own
  // scope instead of needing an effect to copy it in.
  const [scope, setScope] = useState<string[]>(user?.unitScope ?? []);

  const form = useForm<UserInput | UserPatchInput>({
    resolver: zodResolver(editing ? userPatchSchema : userSchema),
    defaultValues: { displayName: '', role: 'unit_scheduler' },
  });

  useEffect(() => {
    if (!open) return;
    form.reset(
      user
        ? {
            displayName: user.displayName,
            role: user.role,
            personnelId: user.personnelId ?? '',
            active: user.active,
          }
        : { email: '', displayName: '', password: '', role: 'unit_scheduler', personnelId: '' },
    );
    // A reset belongs to the dialog opening, not to every render of the form.
  }, [open, user, form]);

  const save = useMutation({
    mutationFn: (values: UserInput | UserPatchInput) => {
      const body = { ...values, unitScope: scope };
      if (!editing) return api.post('/users', body);
      // An untouched password field means "leave it alone".
      const { password, ...rest } = body as UserPatchInput;
      return api.patch(`/users/${user.id}`, password ? { ...rest, password } : rest);
    },
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      onSaved();
      onClose();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const role: Role = useWatch({ control: form.control, name: 'role' }) ?? 'unit_scheduler';
  const errors = form.formState.errors as Record<string, { message?: string } | undefined>;

  return (
    <Dialog
      open={open}
      title={editing ? t('settings.editUser') : t('settings.addUser')}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button
            loading={save.isPending}
            onClick={() => void form.handleSubmit((values) => save.mutate(values))()}
          >
            {t('app.save')}
          </Button>
        </>
      }
    >
      <form className="grid gap-4 sm:grid-cols-2" onSubmit={(event) => event.preventDefault()}>
        {editing ? null : (
          <Field
            label={t('settings.userEmail')}
            hint={t('settings.userEmailHint')}
            error={errors.email?.message}
            required
          >
            {({ id, required }) => (
              <Input
                id={id}
                dir="ltr"
                autoComplete="off"
                aria-required={required}
                {...form.register('email')}
              />
            )}
          </Field>
        )}

        <Field label={t('personnel.name')} error={errors.displayName?.message} required>
          {({ id, required }) => (
            <Input id={id} aria-required={required} {...form.register('displayName')} />
          )}
        </Field>

        <Field
          label={editing ? t('settings.userResetPassword') : t('settings.userPassword')}
          hint={editing ? t('settings.userResetPasswordHint') : t('settings.userPasswordHint')}
          error={errors.password?.message}
          required={!editing}
        >
          {({ id, required }) => (
            <Input
              id={id}
              type="password"
              dir="ltr"
              autoComplete="new-password"
              aria-required={required}
              {...form.register('password')}
            />
          )}
        </Field>

        <Field label={t('settings.userRole')} hint={roleDescriptions[role]} required>
          {({ id }) => (
            <Select id={id} {...form.register('role')}>
              {ROLES.map((value) => (
                <option key={value} value={value}>
                  {roleLabels[value]}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('settings.userPersonnel')} hint={t('settings.userPersonnelHint')}>
          {({ id }) => (
            <Select id={id} {...form.register('personnelId')}>
              <option value="">{t('app.none')}</option>
              {(personnel.data ?? []).map((person) => (
                <option key={person.id} value={person.id}>
                  {person.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <fieldset className="sm:col-span-2">
          <legend className="mb-1 text-sm font-medium">{t('settings.userScope')}</legend>
          <p className="mb-2 text-xs text-ink-faint">{t('settings.userScopeHint')}</p>
          <div className="flex flex-wrap gap-2">
            {(units.data ?? []).map((unit) => (
              <label
                key={unit.id}
                className="flex items-center gap-1.5 rounded-[var(--radius-control)] border border-border-subtle px-2.5 py-1.5 text-sm"
              >
                <input
                  type="checkbox"
                  className="size-4"
                  checked={scope.includes(unit.id)}
                  onChange={(event) =>
                    setScope((current) =>
                      event.target.checked
                        ? [...current, unit.id]
                        : current.filter((id) => id !== unit.id),
                    )
                  }
                />
                {unit.name}
              </label>
            ))}
          </div>
        </fieldset>

        {editing ? (
          <label className="flex items-center gap-2 text-sm sm:col-span-2">
            <input type="checkbox" className="size-4" {...form.register('active')} />
            {t('settings.userActive')}
          </label>
        ) : null}
      </form>
    </Dialog>
  );
}
