import { useMutation } from '@tanstack/react-query';
import { ruleDescriptions, severityLabels } from '@shared/messages.he';
import { Permissions } from '@shared/rbac';
import { formatHours } from '@shared/format';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Input, Select } from '@/components/ui/Input';
import { QueryState } from '@/components/ui/States';
import { useToast } from '@/components/ui/toast-context';
import { useRules } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

/** Scheduling policy is configuration, not hardcoded logic (plan section 48). */

/**
 * The rule config arrives as raw JSON keys. Showing "windowDays" next to a
 * number box asks the reader to speak the schema; these are the same knobs in
 * their own language.
 *
 * `minutes` is deliberately absent: durations are stored in minutes because
 * they divide cleanly, but nobody schedules in them. Those fields are shown,
 * and edited, in hours.
 */
const configLabels: Record<string, string> = {
  count: t('settings.configCount'),
  hours: t('settings.configHours'),
  windowDays: t('settings.configWindowDays'),
};

const isDuration = (key: string) => key === 'minutes';
const configLabel = (key: string) =>
  isDuration(key) ? t('settings.configHours') : (configLabels[key] ?? key);

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
    onError: (error) => {
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));
      void rules.refetch();
    },
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
          <li key={rule.code} className="card flex flex-col gap-3 p-3.5">
            <div>
              <p className="font-medium text-ink">{rule.name}</p>
              {ruleDescriptions[rule.code] ? (
                <p className="mt-0.5 text-sm text-ink-muted">{ruleDescriptions[rule.code]}</p>
              ) : null}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              {Object.entries(rule.config).map(([key, value]) => {
                const shown = isDuration(key) ? value / 60 : value;
                return (
                  <label key={key} className="flex items-center gap-1.5">
                    <span className="text-ink-muted">{configLabel(key)}</span>
                    <span className="inline-flex w-24 shrink-0">
                      <Input
                        className="h-9"
                        type="number"
                        dir="ltr"
                        min={0}
                        step={isDuration(key) ? 0.25 : 1}
                        defaultValue={formatHours(shown)}
                        disabled={!editable}
                        onBlur={(event) => {
                          const entered = Number(event.target.value);
                          if (!Number.isFinite(entered) || entered < 0) {
                            event.target.value = formatHours(shown);
                            return;
                          }
                          const next = isDuration(key) ? Math.round(entered * 60) : entered;
                          if (next !== value) {
                            update.mutate({ code: rule.code, body: { config: { [key]: next } } });
                          }
                        }}
                      />
                    </span>
                  </label>
                );
              })}

              <label className="flex items-center gap-1.5">
                <span className="text-ink-muted">{t('settings.ruleSeverity')}</span>
                <Select
                  className="h-9 w-auto"
                  value={rule.severity}
                  disabled={!editable}
                  onChange={(event) =>
                    update.mutate({ code: rule.code, body: { severity: event.target.value } })
                  }
                >
                  {(['blocking', 'warning', 'info'] as const).map((severity) => (
                    <option key={severity} value={severity}>
                      {severityLabels[severity]}
                    </option>
                  ))}
                </Select>
              </label>

              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={rule.enabled}
                  disabled={!editable}
                  onChange={(event) =>
                    update.mutate({ code: rule.code, body: { enabled: event.target.checked } })
                  }
                />
                {t('settings.ruleEnabled')}
              </label>

              <label className="flex items-center gap-1.5">
                <input
                  type="checkbox"
                  className="size-4"
                  checked={rule.overridable}
                  disabled={!editable}
                  onChange={(event) =>
                    update.mutate({ code: rule.code, body: { overridable: event.target.checked } })
                  }
                />
                {t('settings.ruleOverridable')}
              </label>
            </div>
          </li>
        ))}
      </ul>
    </QueryState>
  );
}
