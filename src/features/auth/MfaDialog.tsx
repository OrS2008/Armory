import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Copy, Download, ShieldCheck } from 'lucide-react';
import { formatSecret } from '@shared/totp';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { downloadBlob } from '@/lib/download';
import { Badge } from '@/components/ui/Badge';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';
import { useAuth } from '@/hooks/auth-context';

interface Setup {
  secret: string;
  uri: string;
}

/**
 * Enrolment and removal of the second factor, for the account signed in here.
 * No QR code: drawing one needs an encoder, and every authenticator accepts a
 * pasted key or URI.
 */
export function MfaDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useAuth();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [setup, setSetup] = useState<Setup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);

  const enabled = user?.mfaEnabled ?? false;

  const refreshSession = () => queryClient.invalidateQueries({ queryKey: ['session'] });
  const fail = (error: unknown) =>
    toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));

  const start = useMutation({
    mutationFn: () => api.post<Setup>('/auth/mfa/setup'),
    onSuccess: (result) => setSetup(result),
    onError: fail,
  });

  const enable = useMutation({
    mutationFn: () => api.post<{ recoveryCodes: string[] }>('/auth/mfa/enable', { code }),
    onSuccess: (result) => {
      setRecoveryCodes(result.recoveryCodes);
      setSetup(null);
      setCode('');
      toast.push('success', t('mfa.enabled'));
      void refreshSession();
    },
    onError: fail,
  });

  const disable = useMutation({
    mutationFn: () => api.post('/auth/mfa/disable', { password }),
    onSuccess: () => {
      setPassword('');
      toast.push('success', t('mfa.disabled'));
      void refreshSession();
      onClose();
    },
    onError: fail,
  });

  const close = () => {
    setSetup(null);
    setCode('');
    setPassword('');
    setRecoveryCodes(null);
    onClose();
  };

  return (
    <Dialog open={open} title={t('mfa.title')} description={t('mfa.subtitle')} onClose={close}>
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="size-5 text-brand-600" aria-hidden />
          <Badge tone={enabled ? 'success' : 'neutral'}>
            {enabled ? t('mfa.statusOn') : t('mfa.statusOff')}
          </Badge>
        </div>

        {recoveryCodes ? (
          <section className="flex flex-col gap-2 rounded-[var(--radius-control)] border border-warning/40 bg-warning-soft p-3">
            <h3 className="text-sm font-semibold text-ink">{t('mfa.recoveryTitle')}</h3>
            <p className="text-xs text-ink-muted">{t('mfa.recoveryHint')}</p>
            <ul className="ltr-inline grid grid-cols-2 gap-1 font-mono text-sm">
              {recoveryCodes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <div className="flex flex-wrap gap-2">
              <Button
                size="sm"
                variant="secondary"
                icon={<Copy className="size-4" />}
                onClick={() => {
                  void navigator.clipboard
                    ?.writeText(recoveryCodes.join('\n'))
                    .then(() => toast.push('success', t('mfa.recoveryCopied')));
                }}
              >
                {t('mfa.recoveryCopy')}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                icon={<Download className="size-4" />}
                onClick={() =>
                  downloadBlob(
                    'shabatzak-recovery-codes.txt',
                    new Blob([recoveryCodes.join('\n')], { type: 'text/plain;charset=utf-8' }),
                  )
                }
              >
                {t('mfa.recoveryDownload')}
              </Button>
            </div>
          </section>
        ) : null}

        {!enabled && !setup ? (
          <Button loading={start.isPending} onClick={() => start.mutate()}>
            {t('mfa.start')}
          </Button>
        ) : null}

        {setup ? (
          <section className="flex flex-col gap-3">
            <p className="text-sm text-ink-muted">{t('mfa.step1')}</p>
            <Field label={t('mfa.secret')}>
              {({ id }) => <Input id={id} readOnly dir="ltr" value={formatSecret(setup.secret)} />}
            </Field>
            <Field label={t('mfa.uri')}>
              {({ id }) => (
                <Input id={id} readOnly dir="ltr" className="text-xs" value={setup.uri} />
              )}
            </Field>
            <p className="text-sm text-ink-muted">{t('mfa.step2')}</p>
            <Field label={t('auth.mfaCode')} required>
              {({ id }) => (
                <Input
                  id={id}
                  dir="ltr"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                />
              )}
            </Field>
            <Button loading={enable.isPending} onClick={() => enable.mutate()}>
              {t('auth.mfaSubmit')}
            </Button>
          </section>
        ) : null}

        {enabled ? (
          <section className="flex flex-col gap-3 border-t border-border-subtle pt-3">
            <Field label={t('mfa.confirmPassword')}>
              {({ id }) => (
                <Input
                  id={id}
                  type="password"
                  dir="ltr"
                  autoComplete="current-password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              )}
            </Field>
            <Button
              variant="danger"
              disabled={password.length === 0}
              loading={disable.isPending}
              onClick={() => disable.mutate()}
            >
              {t('mfa.stop')}
            </Button>
          </section>
        ) : null}
      </div>
    </Dialog>
  );
}
