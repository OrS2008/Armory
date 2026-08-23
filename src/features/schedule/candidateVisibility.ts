/**
 * Which candidates render, out of a ranked and possibly search-filtered list.
 *
 * A flat cap over the whole list once hid real, assignable people: with a
 * plain seat, most of the roster is eligible, so anyone ranked past the cutoff
 * simply never appeared — not "behind a search box", just gone, with nothing
 * on screen hinting that a search would help. An assignable soldier is never
 * something the reader should have to already know to look for.
 *
 * So the cap applies only to the ineligible tail, kept around for its
 * blockers' explanations rather than for picking someone. Every eligible
 * candidate always renders.
 */
import type { Candidate } from '@shared/candidates';

export function selectVisibleCandidates<T extends Pick<Candidate, 'eligible'>>(
  candidates: T[],
  cap: number,
): T[] {
  const eligible = candidates.filter((candidate) => candidate.eligible);
  const ineligible = candidates.filter((candidate) => !candidate.eligible);
  const ineligibleRoom = Math.max(0, cap - eligible.length);
  return [...eligible, ...ineligible.slice(0, ineligibleRoom)];
}
