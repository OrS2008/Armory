import { useState } from 'react';
import { Permissions } from '@shared/rbac';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { PageHeader } from '@/components/layout/PageHeader';
import { useAuth } from '@/hooks/auth-context';
import { AuditPanel } from './AuditPanel';
import { QualificationsPanel } from './QualificationsPanel';
import { RulesPanel } from './RulesPanel';
import { UnitsPanel } from './UnitsPanel';

type Tab = 'rules' | 'units' | 'qualifications' | 'audit';

export function SettingsPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>('rules');

  const tabs: { id: Tab; label: string; visible: boolean }[] = [
    { id: 'rules', label: t('settings.rules'), visible: can(Permissions.rulesRead) },
    { id: 'units', label: t('settings.units'), visible: can(Permissions.unitsRead) },
    {
      id: 'qualifications',
      label: t('settings.qualifications'),
      visible: can(Permissions.qualificationsRead),
    },
    { id: 'audit', label: t('settings.audit'), visible: can(Permissions.auditRead) },
  ];

  return (
    <>
      <PageHeader title={t('settings.title')} />

      <div role="tablist" className="mb-4 flex flex-wrap gap-2">
        {tabs
          .filter((item) => item.visible)
          .map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              onClick={() => setTab(item.id)}
              className={cn(
                'rounded-full border px-3 py-1.5 text-sm font-medium transition-colors',
                tab === item.id
                  ? 'border-brand-500 bg-brand-50 text-brand-700'
                  : 'border-border-subtle text-ink-muted hover:bg-surface-sunken',
              )}
            >
              {item.label}
            </button>
          ))}
      </div>

      {tab === 'rules' ? <RulesPanel /> : null}
      {tab === 'units' ? <UnitsPanel /> : null}
      {tab === 'qualifications' ? <QualificationsPanel /> : null}
      {tab === 'audit' ? <AuditPanel /> : null}
    </>
  );
}
