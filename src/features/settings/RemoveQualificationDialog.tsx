import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { Trash2 } from 'lucide-react';
import type { Qualification } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Select } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';

interface Usage {
  heldBy: number;
  requiredBy: number;
  excludedBy: number;
  seats: number;
}

/**
 * Removing a mark, or merging it into another.
 *
 * Every table that points at a mark cascades, so a plain delete quietly strips
 * it from everyone who holds it and from every post that requires it. The
 * server refuses that and says what is attached; this shows the same thing
 * before the button is pressed, and offers the answer a duplicate actually
 * needs — move it onto the mark that stays.
 */
export function RemoveQualificationDialog({
  qualification,
  others,
  onClose,
  onRemoved,
}: {
  qualification: Qualification | null;
  others: Qualification[];
  onClose: () => void;
  onRemoved: () => void;
}) {
  const toast = useToast();
  const [into, setInto] = useState('');
  const [usage, setUsage] = useState<Usage | null>(null);

  const remove = useMutation({
    mutationFn: () =>
      api.delete<{ merged: string | null }>(
        `/qualifications/${qualification?.id}${into ? `?merge=${into}` : ''}`,
      ),
    onSuccess: () => {
      toast.push(
        'success',
        into ? t('settings.qualificationMerged') : t('settings.qualificationRemoved'),
      );
      setInto('');
      setUsage(null);
      onRemoved();
      onClose();
    },
    onError: (error) => {
      // The refusal carries the count, which is the whole reason it refused.
      const details = error instanceof ApiError ? error.details : undefined;
      const attached = (details as { usage?: Usage } | undefined)?.usage;
      if (attached) {
        setUsage(attached);
        return;
      }
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));
    },
  });

  const close = () => {
    setInto('');
    setUsage(null);
    onClose();
  };

  return (
    <Dialog
      open={qualification !== null}
      title={t('settings.removeQualification')}
      {...(qualification ? { description: qualification.name } : {})}
      onClose={close}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {t('app.cancel')}
          </Button>
          <Button
            variant="danger"
            icon={<Trash2 className="size-4" />}
            loading={remove.isPending}
            disabled={usage !== null && !into}
            onClick={() => remove.mutate()}
          >
            {into ? t('settings.mergeAndRemove') : t('settings.removeQualification')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {usage ? (
          <div className="rounded-[var(--radius-control)] border border-warning/40 bg-warning/10 p-3 text-sm">
            <p className="font-medium">{t('settings.qualificationInUse')}</p>
            <ul className="mt-2 flex flex-col gap-0.5 text-ink-muted">
              {usage.heldBy > 0 ? (
                <li>{t('settings.usageHeldBy', { count: usage.heldBy })}</li>
              ) : null}
              {usage.requiredBy > 0 ? (
                <li>{t('settings.usageRequiredBy', { count: usage.requiredBy })}</li>
              ) : null}
              {usage.excludedBy > 0 ? (
                <li>{t('settings.usageExcludedBy', { count: usage.excludedBy })}</li>
              ) : null}
              {usage.seats > 0 ? <li>{t('settings.usageSeats', { count: usage.seats })}</li> : null}
            </ul>
          </div>
        ) : (
          <p className="text-sm text-ink-muted">{t('settings.removeQualificationHint')}</p>
        )}

        <Field label={t('settings.mergeInto')} hint={t('settings.mergeIntoHint')}>
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={into}
              onChange={(event) => setInto(event.target.value)}
            >
              <option value="">{t('settings.mergeIntoNone')}</option>
              {others.map((other) => (
                <option key={other.id} value={other.id}>
                  {other.name} ({other.code})
                </option>
              ))}
            </Select>
          )}
        </Field>
      </div>
    </Dialog>
  );
}
