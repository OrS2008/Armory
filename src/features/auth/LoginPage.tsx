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
  const { user, isLoading, login, completeMfa } = useAuth();
  const navigate = useNavigate();
  const [serverError, setServerError] = useState<string | null>(null);
  // Set once the password has been accepted and only the code is missing.
  const [challenge, setChallenge] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [verifying, setVerifying] = useState(false);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  if (!isLoading && user) return <Navigate to="/dashboard" replace />;

  const onSubmit = form.handleSubmit(async (values) => {
    setServerError(null);
    try {
      const pending = await login(values.email, values.password);
      if (pending) {
        setChallenge(pending.challenge);
        return;
      }
      await navigate('/dashboard', { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t('state.errorBody'));
    }
  });

  const onVerify = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!challenge) return;
    setServerError(null);
    setVerifying(true);
    try {
      await completeMfa(challenge, code);
      await navigate('/dashboard', { replace: true });
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : t('state.errorBody'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <main className="flex min-h-dvh items-center justify-center bg-surface px-4 py-10">
      <div className="card w-full max-w-sm p-6">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <ShieldCheck className="size-9 text-brand-600" aria-hidden />
          <h1 className="text-xl font-semibold">{t('auth.title')}</h1>
          <p className="text-sm text-ink-muted">{t('auth.subtitle')}</p>
        </div>

        {challenge ? (
          <form className="flex flex-col gap-4" onSubmit={(event) => void onVerify(event)}>
            <p className="text-sm text-ink-muted">{t('auth.mfaPrompt')}</p>
            <Field label={t('auth.mfaCode')} required>
              {({ id, required }) => (
                <Input
                  id={id}
                  aria-required={required}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoCapitalize="characters"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
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

            <Button type="submit" size="lg" loading={verifying}>
              {t('auth.mfaSubmit')}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setChallenge(null);
                setCode('');
                setServerError(null);
              }}
            >
              {t('auth.mfaBack')}
            </Button>
          </form>
        ) : (
          <form
            className="flex flex-col gap-4"
            onSubmit={(event) => void onSubmit(event)}
            noValidate
          >
            <Field label={t('auth.email')} error={form.formState.errors.email?.message} required>
              {({ id, describedBy, invalid, required }) => (
                <Input
                  id={id}
                  aria-required={required}
                  type="text"
                  inputMode="text"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
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
        )}
      </div>
    </main>
  );
}
