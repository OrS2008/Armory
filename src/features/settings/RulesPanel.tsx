import { useMutation } from '@tanstack/react-query';
import { severityLabels } from '@shared/messages.he';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Select } from '@/components/ui/Input';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useRules } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

/** Scheduling policy is configuration, not hardcoded logic (plan section 48). */
export function RulesPanel() {
  const { can } = useAuth();
  const toast = useToast();
  const rules = useRules();
  const editable = can(Permissions.rulesWrite);

  const update = useMutation({
    mutationFn: (input: { code: string; body: Record<string, unknown> }) =>
      api.patch(`/rules/${input.code}`, input.body),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      void rules.refetch();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  return (
    <QueryState
      isLoading={rules.isLoading}
      error={rules.error}
      onRetry={() => void rules.refetch()}
    >
      <p className="mb-3 text-sm text-ink-muted">{t('settings.rulesHint')}</p>
      <ul className="flex flex-col gap-2">
        {(rules.data ?? []).map((rule) => (
          <li key={rule.code} className="card flex flex-wrap items-center gap-3 p-3">
            <div className="min-w-48 flex-1">
              <p className="font-medium">{rule.name}</p>
              <p className="ltr-inline text-xs text-ink-faint">{rule.code}</p>
            </div>

            {Object.entries(rule.config).map(([key, value]) => (
              <label key={key} className="flex items-center gap-1.5 text-sm">
                <span className="text-ink-muted">{key}</span>
                <input
                  type="number"
                  dir="ltr"
                  defaultValue={value}
                  disabled={!editable}
                  className="h-9 w-24 rounded-[var(--radius-control)] border border-border-strong px-2 text-sm"
                  onBlur={(event) => {
                    const next = Number(event.target.value);
                    if (Number.isFinite(next) && next !== value) {
                      update.mutate({ code: rule.code, body: { config: { [key]: next } } });
                    }
                  }}
                />
              </label>
            ))}

            <label className="flex items-center gap-1.5 text-sm">
              <span className="text-ink-muted">{t('settings.ruleSeverity')}</span>
              <Select
                className="h-9 w-auto"
                value={rule.severity}
                disabled={!editable}
                onChange={(event) =>
                  update.mutate({
                    code: rule.code,
                    body: { severity: event.target.value },
                  })
                }
              >
                {(['blocking', 'warning', 'info'] as const).map((severity) => (
                  <option key={severity} value={severity}>
                    {severityLabels[severity]}
                  </option>
                ))}
              </Select>
            </label>

            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={rule.enabled}
                disabled={!editable}
                onChange={(event) =>
                  update.mutate({ code: rule.code, body: { enabled: event.target.checked } })
                }
              />
              {t('settings.ruleEnabled')}
            </label>

            <label className="flex items-center gap-1.5 text-sm">
              <input
                type="checkbox"
                checked={rule.overridable}
                disabled={!editable}
                onChange={(event) =>
                  update.mutate({ code: rule.code, body: { overridable: event.target.checked } })
                }
              />
              {t('settings.ruleOverridable')}
            </label>
          </li>
        ))}
      </ul>
    </QueryState>
  );
}
