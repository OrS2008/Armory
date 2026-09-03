import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Plus, Trash2, UserPlus } from 'lucide-react';
import type { AssignmentType, AssignmentTypeCrew } from '@shared/types';
import { t } from '@/i18n';
import { ApiError, api } from '@/lib/api';
import { Button } from '@/components/ui/Button';
import { Dialog } from '@/components/ui/Dialog';
import { Input, Select } from '@/components/ui/Input';
import { IconButton } from '@/components/ui/IconButton';
import { useToast } from '@/components/ui/toast-context';
import { usePersonnel, useQualifications } from '@/hooks/queries';

interface DraftMember {
  personnelId: string;
  role: string | null;
}
interface Draft {
  name: string;
  members: DraftMember[];
}

/**
 * The fixed crews of a post.
 *
 * חפ״ק is not four seats filled from the roster: it is two rotations of four
 * who go on together. That is a fact about the group rather than about any of
 * them, so it cannot be said with a qualification, and it is edited here.
 *
 * The whole set is saved at once. A crew only means anything beside the others
 * — "these four, and those four" — so saving one at a time invites a moment
 * where somebody belongs to both, or to neither, and every shift on the post
 * is refused until the second half arrives.
 */
export function CrewsDialog({
  post,
  onClose,
}: {
  post: AssignmentType | null;
  onClose: () => void;
}) {
  const toast = useToast();
  const personnel = usePersonnel();
  const qualifications = useQualifications();
  /*
   * Null until somebody types: the crews as saved are what is shown, and the
   * draft only exists once it differs from them. Pushing the fetched rows into
   * state from an effect would re-render for nothing and, worse, overwrite an
   * edit in progress the moment the query refetched.
   */
  const [edited, setEdited] = useState<Draft[] | null>(null);

  const crews = useQuery({
    enabled: post !== null,
    queryKey: ['assignment-types', post?.id, 'crews'],
    queryFn: () => api.get<{ crews: AssignmentTypeCrew[] }>(`/assignment-types/${post?.id}/crews`),
    select: (data) => data.crews,
  });

  const saved: Draft[] = (crews.data ?? []).map((crew) => ({
    name: crew.name,
    members: crew.members.map((member) => ({
      personnelId: member.personnelId,
      role: member.roleQualificationId,
    })),
  }));
  const draft = edited ?? saved;
  const setDraft = (change: (current: Draft[]) => Draft[]) =>
    setEdited((current) => change(current ?? saved));

  const save = useMutation({
    mutationFn: () =>
      api.put(`/assignment-types/${post?.id}/crews`, {
        crews: draft.map((crew, index) => ({
          name: crew.name.trim(),
          position: index + 1,
          members: crew.members.filter((member) => member.personnelId !== ''),
        })),
      }),
    onSuccess: () => {
      toast.push('success', t('state.savedTitle'));
      setEdited(null);
      void crews.refetch();
      onClose();
    },
    onError: (error) =>
      toast.push('error', error instanceof ApiError ? error.message : t('state.errorBody')),
  });

  const edit = (index: number, change: (crew: Draft) => Draft) =>
    setDraft((current) => current.map((crew, at) => (at === index ? change(crew) : crew)));

  // The seats this post actually names, so a crew is built out of the same
  // roles the sheet prints rather than a free-text list.
  const seats = (post?.requiredQualifications ?? [])
    .filter((item) => item.minCount > 0)
    .map((item) => item.qualificationId);
  const nameOf = (id: string) =>
    (qualifications.data ?? []).find((one) => one.id === id)?.name ?? id;
  const taken = new Set(draft.flatMap((crew) => crew.members.map((one) => one.personnelId)));

  return (
    <Dialog
      open={post !== null}
      title={t('assignments.crews')}
      {...(post ? { description: `${post.name} — ${t('assignments.crewsHint')}` } : {})}
      size="lg"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {t('app.cancel')}
          </Button>
          <Button loading={save.isPending} onClick={() => save.mutate()}>
            {t('app.save')}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {draft.length === 0 ? (
          <p className="text-sm text-ink-muted">{t('assignments.crewsEmpty')}</p>
        ) : null}

        {draft.map((crew, index) => (
          <section
            key={index}
            className="rounded-[var(--radius-control)] border border-border-subtle p-3"
          >
            <div className="mb-2 flex items-center gap-2">
              <Input
                aria-label={t('assignments.crewName')}
                className="max-w-48"
                value={crew.name}
                onChange={(event) => edit(index, (one) => ({ ...one, name: event.target.value }))}
              />
              <IconButton
                className="ms-auto"
                label={`${t('assignments.removeCrew')} — ${crew.name}`}
                onClick={() => setDraft((current) => current.filter((_, at) => at !== index))}
                icon={<Trash2 className="size-4" />}
              />
            </div>

            <ul className="flex flex-col gap-2">
              {crew.members.map((member, memberIndex) => (
                <li key={memberIndex} className="flex flex-wrap items-center gap-2">
                  <Select
                    aria-label={t('availability.person')}
                    className="max-w-56"
                    value={member.personnelId}
                    onChange={(event) =>
                      edit(index, (one) => ({
                        ...one,
                        members: one.members.map((each, at) =>
                          at === memberIndex ? { ...each, personnelId: event.target.value } : each,
                        ),
                      }))
                    }
                  >
                    <option value="">{t('app.none')}</option>
                    {(personnel.data ?? [])
                      .filter((person) => person.id === member.personnelId || !taken.has(person.id))
                      .map((person) => (
                        <option key={person.id} value={person.id}>
                          {person.displayName}
                        </option>
                      ))}
                  </Select>
                  <Select
                    aria-label={t('assignments.crewSeat')}
                    className="max-w-40"
                    value={member.role ?? ''}
                    onChange={(event) =>
                      edit(index, (one) => ({
                        ...one,
                        members: one.members.map((each, at) =>
                          at === memberIndex
                            ? {
                                ...each,
                                role: event.target.value === '' ? null : event.target.value,
                              }
                            : each,
                        ),
                      }))
                    }
                  >
                    <option value="">{t('assignments.crewSeatPlain')}</option>
                    {seats.map((seat) => (
                      <option key={seat} value={seat}>
                        {nameOf(seat)}
                      </option>
                    ))}
                  </Select>
                  <IconButton
                    label={t('assignments.removeCrewMember')}
                    onClick={() =>
                      edit(index, (one) => ({
                        ...one,
                        members: one.members.filter((_, at) => at !== memberIndex),
                      }))
                    }
                    icon={<Trash2 className="size-4" />}
                  />
                </li>
              ))}
            </ul>

            <Button
              className="mt-2"
              size="sm"
              variant="ghost"
              icon={<UserPlus className="size-4" />}
              onClick={() =>
                edit(index, (one) => ({
                  ...one,
                  members: [...one.members, { personnelId: '', role: null }],
                }))
              }
            >
              {t('assignments.addCrewMember')}
            </Button>
          </section>
        ))}

        <Button
          size="sm"
          variant="secondary"
          icon={<Plus className="size-4" />}
          onClick={() =>
            setDraft((current) => [
              ...current,
              { name: t('assignments.crewNumbered', { number: current.length + 1 }), members: [] },
            ])
          }
        >
          {t('assignments.addCrew')}
        </Button>
      </div>
    </Dialog>
  );
}
