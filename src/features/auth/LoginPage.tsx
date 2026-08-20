import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ShieldCheck } from 'lucide-react';
import { loginSchema, type LoginInput } from '@shared/schemas';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useAuth } from '@/hooks/auth-context';

export function LoginPage() {
  const { user, isLoading, login } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      await login(values.email, values.password);
      await navigate('/dashboard', { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t('state.errorBody'));
    }
  });

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <ShieldCheck className="size-9 text-brand-600" aria-hidden />
          <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
          <p className="text-sm text-ink-muted">{t('auth.subtitle')}</p>
        </div>

        <form className="flex flex-col gap-4" onSubmit={(event) => void onSubmit(event)} noValidate>
          <Field label={t('auth.email')} error={form.formState.errors.email?.message} required>
            {({ id, describedBy, invalid, required }) => (
              <Input
                id={id}
                aria-required={required}
                type="email"
                autoComplete="username"
                dir="ltr"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register('email')}
              />
            )}
          </Field>

          <Field
            label={t('auth.password')}
            error={form.formState.errors.password?.message}
            required
          >
            {({ id, describedBy, invalid, required }) => (
              <Input
                id={id}
                aria-required={required}
                type="password"
                autoComplete="current-password"
                dir="ltr"
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register('password')}
              />
            )}
          </Field>

          {serverError ? (
            <p
              role="alert"
              className="rounded-[var(--radius-control)] bg-danger-soft px-3 py-2 text-sm text-danger"
            >
              {serverError}
            </p>
          ) : null}

          <Button type="submit" size="lg" loading={form.formState.isSubmitting}>
            {t('auth.submit')}
          </Button>
        </form>
      </div>
    </main>
  );
}
