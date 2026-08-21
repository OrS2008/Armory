import { Link } from 'react-router-dom';
import { Check, ChevronLeft } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { Card, CardHeader } from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import {
  useAssignmentTypes,
  usePersonnel,
  useQualifications,
  useSchedules,
  useUnits,
} from '@/hooks/queries';

interface Step {
  key: string;
  to: string;
  label: string;
  hint: string;
  done: boolean;
}

/**
 * Nothing in the navigation says which screen to open first, and the order
 * actually matters — a schedule cannot be built before the people and the
 * assignment types exist. The card answers that once and then disappears.
 */
export function SetupChecklist() {
  const units = useUnits();
  const qualifications = useQualifications();
  const personnel = usePersonnel();
  const types = useAssignmentTypes();
  const schedules = useSchedules();

  const queries = [units, qualifications, personnel, types, schedules];
  // Until every source has answered we cannot tell "not set up yet" apart from
  // "not loaded yet", and a checklist of five empty circles would be a lie.
  if (queries.some((query) => query.isPending || query.isError)) return null;

  const steps: Step[] = [
    {
      key: 'units',
      to: '/settings',
      label: t('setup.units'),
      hint: t('setup.unitsHint'),
      done: (units.data ?? []).length > 0,
    },
    {
      key: 'qualifications',
      to: '/settings',
      label: t('setup.qualifications'),
      hint: t('setup.qualificationsHint'),
      done: (qualifications.data ?? []).length > 0,
    },
    {
      key: 'personnel',
      to: '/personnel',
      label: t('setup.personnel'),
      hint: t('setup.personnelHint'),
      done: (personnel.data ?? []).length > 0,
    },
    {
      key: 'types',
      to: '/assignment-types',
      label: t('setup.types'),
      hint: t('setup.typesHint'),
      done: (types.data ?? []).length > 0,
    },
    {
      key: 'schedule',
      to: '/schedule',
      label: t('setup.schedule'),
      hint: t('setup.scheduleHint'),
      done: (schedules.data ?? []).length > 0,
    },
  ];

  const remaining = steps.filter((step) => !step.done).length;
  if (remaining === 0) return null;

  return (
    <Card>
      <CardHeader
        title={t('setup.title')}
        description={t('setup.subtitle')}
        action={<Badge tone="warning">{t('setup.remaining', { count: remaining })}</Badge>}
      />
      <ol className="flex flex-col divide-y divide-border-subtle">
        {steps.map((step, index) => (
          <li key={step.key}>
            <Link
              to={step.to}
              className="flex items-center gap-3 py-2.5 transition-colors hover:bg-surface-sunken"
            >
              {step.done ? (
                <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-success-soft text-success">
                  <Check className="size-4" aria-hidden />
                  <span className="sr-only">{t('setup.done')}</span>
                </span>
              ) : (
                <span className="ltr-inline inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                  {index + 1}
                </span>
              )}
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    'block font-medium',
                    step.done ? 'text-ink-muted line-through' : 'text-ink',
                  )}
                >
                  {step.label}
                </span>
                <span className="block text-xs text-ink-muted">{step.hint}</span>
              </span>
              <ChevronLeft className="size-4 shrink-0 text-ink-faint" aria-hidden />
              <span className="sr-only">{t('setup.go')}</span>
            </Link>
          </li>
        ))}
      </ol>
    </Card>
  );
}
