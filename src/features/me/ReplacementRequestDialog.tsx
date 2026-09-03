import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { formatRange } from '@shared/format';
import type { Assignment } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Field } from '@/components/ui/Field';
import { Select, Textarea } from '@/components/ui/Input';
import { useToast } from '@/components/ui/toast-context';

/**
 * Asking for cover, and naming it.
 *
 * The arrangement already happens — in the group chat, where nothing checks it
 * and nothing records it, and where the person doing the asking has no way of
 * knowing who is even free. The list here is the engine's own answer to that,
 * and a name chosen from it is checked before the request is filed, so nobody
 * spends an evening arranging cover the roster was never going to take.
 */
export function ReplacementRequestDialog({
  open,
  assignment,
  personnelId,
  timezone,
  onClose,
  onSent,
}: {
  open: boolean;
  assignment: Assignment | null;
  personnelId: string;
  timezone: string;
  onClose: () => void;
  onSent: () => void;
}) {
  const toast = useToast();
  const [reason, setReason] = useState('');
  const [standIn, setStandIn] = useState('');

  const cover = useQuery({
    enabled: open && Boolean(assignment),
    queryKey: ['me', 'cover', assignment?.id],
    queryFn: () =>
      api.get<{ candidates: { personnelId: string; displayName: string }[] }>('/me/cover', {
        assignmentId: assignment?.id,
      }),
    select: (data) => data.candidates,
  });

  const send = useMutation({
    mutationFn: () =>
      api.post('/replacements', {
        assignmentId: assignment?.id,
        personnelId,
        reason: reason.trim() === '' ? null : reason.trim(),
        ...(standIn === '' ? {} : { replacementPersonnelId: standIn }),
      }),
    onSuccess: () => {
      toast.push('success', standIn ? t('replacements.sentToPeer') : t('replacements.sent'));
      setReason('');
      setStandIn('');
      onSent();
      onClose();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const candidates = cover.data ?? [];

  return (
    <Dialog
      open={open}
      title={t('replacements.request')}
      {...(assignment
        ? {
            description: `${assignment.title ?? assignment.assignmentTypeName} · ${formatRange(
              assignment.startAt,
              assignment.endAt,
              timezone,
            )}`,
          }
        : {})}
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button loading={send.isPending} onClick={() => send.mutate()}>
            {t('replacements.send')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label={t('replacements.standIn')}
          hint={
            cover.isPending
              ? t('app.loading')
              : candidates.length === 0
                ? t('replacements.noCover')
                : t('replacements.standInHint')
          }
        >
          {({ id, describedBy }) => (
            <Select
              id={id}
              aria-describedby={describedBy}
              value={standIn}
              onChange={(event) => setStandIn(event.target.value)}
            >
              <option value="">{t('replacements.letCommanderChoose')}</option>
              {candidates.map((candidate) => (
                <option key={candidate.personnelId} value={candidate.personnelId}>
                  {candidate.displayName}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label={t('replacements.reason')} hint={t('replacements.reasonHint')}>
          {({ id, describedBy }) => (
            <Textarea
              id={id}
              aria-describedby={describedBy}
              rows={3}
              maxLength={300}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Dialog>
  );
}
