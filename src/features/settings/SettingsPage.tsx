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
import { UsersPanel } from './UsersPanel';

type Tab = 'rules' | 'units' | 'qualifications' | 'users' | 'audit';

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
    { id: 'users', label: t('settings.users'), visible: can(Permissions.usersManage) },
    { id: 'audit', label: t('settings.audit'), visible: can(Permissions.auditRead) },
  ];

  return (
    <>
      <PageHeader title={t('settings.title')} description={t('settings.subtitle')} />

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
      {tab === 'users' ? <UsersPanel /> : null}
      {tab === 'audit' ? <AuditPanel /> : null}

      {/* Which build is live, so "did my change reach the site?" has an answer. */}
      <p className="ltr-inline mt-6 text-center text-xs text-ink-faint">
        {t('settings.buildRef', { ref: __BUILD_REF__ })}
      </p>
    </>
  );
}
