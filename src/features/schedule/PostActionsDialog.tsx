import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Settings2, Trash2 } from 'lucide-react';
import { formatTime } from '@shared/format';
import type { Assignment } from '@shared/types';
import { t } from '@/i18n';
import { ApiError } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { useToast } from '@/components/ui/toast-context';
import type { SheetPost } from '@/components/scheduling/RosterBoard';
import { useAssignmentTypes, useCancelAssignment, useDeleteAssignmentType } from '@/hooks/queries';

interface Props {
  /** The post whose title bar was pressed, or null when nothing is open. */
  post: SheetPost | null;
  /** Its turns on the day the sheet is showing, in the order the card prints them. */
  shifts: Assignment[];
  timezone: string;
  /** Whether the reader may take shifts off the board. */
  canRemoveShifts: boolean;
  /** Whether the reader may remove the post itself. */
  canDeletePost: boolean;
  onClose: () => void;
}

/**
 * What a press on a card's title bar opens.
 *
 * The bar names the post, and until now it did nothing but start a drag — so
 * "we do not stand this any more" meant leaving the sheet, finding the post on
 * the settings screen and deleting it there, or removing its turns one dialog
 * at a time. Both acts belong on the card itself, and they are different acts:
 * clearing today's turns leaves the post standing for tomorrow, while removing
 * the post takes every turn it ever had with it.
 */
export function PostActionsDialog({
  post,
  shifts,
  timezone,
  canRemoveShifts,
  canDeletePost,
  onClose,
}: Props) {
  if (!post) return null;
  // Keyed on the post: opening another card starts from a closed confirmation
  // rather than one left ticked by the card before it.
  return (
    <PostActions
      key={post.assignmentTypeId}
      post={post}
      shifts={shifts}
      timezone={timezone}
      canRemoveShifts={canRemoveShifts}
      canDeletePost={canDeletePost}
      onClose={onClose}
    />
  );
}

function PostActions({
  post,
  shifts,
  timezone,
  canRemoveShifts,
  canDeletePost,
  onClose,
}: Props & { post: NonNullable<Props['post']> }) {
  const toast = useToast();
  const cancel = useCancelAssignment();
  const remove = useDeleteAssignmentType();
  const types = useAssignmentTypes();
  const [confirmingShifts, setConfirmingShifts] = useState(false);
  const [confirmingPost, setConfirmingPost] = useState(false);
  const [acceptsShiftLoss, setAcceptsShiftLoss] = useState(false);
  const [clearing, setClearing] = useState(false);

  /*
   * How many shifts the post has altogether, which is what deleting it costs.
   * The board only holds the day on screen, so the count comes from the posts
   * list; the day's own turns are the floor, because they are shifts the reader
   * can see and the list could still be a moment behind. Until it has answered
   * at all, the cost is not known and the button that spends it stays shut.
   */
  const counted = types.data?.find((type) => type.id === post.assignmentTypeId)?.usageCount ?? 0;
  const usage = Math.max(counted, shifts.length);

  const clearDay = async () => {
    setClearing(true);
    let deleted = 0;
    let cancelled = 0;
    try {
      // One at a time, in the order the card prints them: a shift that refuses
      // should stop the rest rather than leave the card half cleared.
      for (const shift of shifts) {
        const result = await cancel.mutateAsync(shift.id);
        if (result.status === 'deleted') deleted += 1;
        else cancelled += 1;
      }
      toast.push('success', t('schedule.postClearDayDone', { deleted, cancelled }));
      onClose();
    } catch (error) {
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody'));
    } finally {
      setClearing(false);
    }
  };

  return (
    <Dialog
      open
      title={post.title}
      description={
        shifts.length > 0
          ? t('schedule.postShiftsToday', { count: shifts.length })
          : t('schedule.postNoShiftsToday')
      }
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          {t('app.close')}
        </Button>
      }
    >
      {shifts.length > 0 ? (
        <ul className="mb-4 grid gap-1 text-sm">
          {shifts.map((shift) => (
            <li key={shift.id} className="flex items-baseline justify-between gap-3">
              <span>{shift.title ?? post.name}</span>
              <span className="ltr-inline text-ink-muted">
                {formatTime(shift.startAt, timezone)} - {formatTime(shift.endAt, timezone)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}

      <Link
        to="/assignment-types"
        className="inline-flex items-center gap-1.5 text-sm font-medium text-brand hover:underline"
        onClick={onClose}
      >
        <Settings2 className="size-4" aria-hidden />
        {t('schedule.postSettings')}
      </Link>

      {canRemoveShifts && shifts.length > 0 ? (
        <div className="mt-4 rounded-[var(--radius-control)] border border-border-subtle p-3">
          {confirmingShifts ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm">{t('schedule.postClearDayConfirm')}</p>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  loading={clearing}
                  onClick={() => void clearDay()}
                >
                  {t('schedule.postClearDay', { count: shifts.length })}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingShifts(false)}>
                  {t('app.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-4" />}
              onClick={() => setConfirmingShifts(true)}
            >
              {t('schedule.postClearDay', { count: shifts.length })}
            </Button>
          )}
        </div>
      ) : null}

      {canDeletePost ? (
        <div className="mt-3 rounded-[var(--radius-control)] border border-danger-soft bg-danger-soft/40 p-3">
          {confirmingPost ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm text-danger">
                {usage > 0
                  ? t('assignments.deleteTypeWithShiftsConfirm', { name: post.name, count: usage })
                  : t('assignments.deleteTypeConfirm', { name: post.name })}
              </p>
              {usage > 0 ? (
                <label className="flex items-start gap-2 text-sm text-danger">
                  <input
                    type="checkbox"
                    className="mt-0.5"
                    checked={acceptsShiftLoss}
                    onChange={(event) => setAcceptsShiftLoss(event.target.checked)}
                  />
                  <span>{t('assignments.deleteTypeAcceptShiftLoss', { count: usage })}</span>
                </label>
              ) : null}
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="danger"
                  size="sm"
                  disabled={types.isPending || (usage > 0 && !acceptsShiftLoss)}
                  loading={remove.isPending}
                  onClick={() =>
                    remove.mutate(
                      { id: post.assignmentTypeId, withShifts: usage > 0 },
                      {
                        onSuccess: (result) => {
                          toast.push(
                            'success',
                            result.shifts > 0
                              ? t('assignments.deleteTypeWithShiftsDone', { count: result.shifts })
                              : t('assignments.deleteTypeDone'),
                          );
                          onClose();
                        },
                        onError: (error) =>
                          toast.push(
                            'error',
                            error instanceof ApiError ? error.message : t('state.errorBody'),
                          ),
                      },
                    )
                  }
                >
                  {t('assignments.deleteType')}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmingPost(false)}>
                  {t('app.cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              icon={<Trash2 className="size-4" />}
              onClick={() => setConfirmingPost(true)}
            >
              {t('schedule.postDelete')}
            </Button>
          )}
        </div>
      ) : null}
    </Dialog>
  );
}
