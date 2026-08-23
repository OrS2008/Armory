import { describe, expect, it } from 'vitest';
import { selectVisibleCandidates } from '../candidateVisibility';

const person = (id: string, eligible: boolean) => ({ id, eligible });

describe('which candidates render', () => {
  /*
   * The bug this guards against: a plain seat with no qualification
   * requirement makes most of the roster eligible, so a flat cap over the
   * whole ranked list silently dropped real, assignable people once the
   * roster passed the cap — not "reachable by searching", just gone. This is
   * "sometimes the auto-fill doesn't see soldiers, until I search for them."
   */
  it('never drops an eligible candidate, however many there are', () => {
    const eligible = Array.from({ length: 20 }, (_unused, index) => person(`e${index}`, true));
    const shown = selectVisibleCandidates(eligible, 12);
    expect(shown).toHaveLength(20);
    expect(shown).toEqual(eligible);
  });

  it('fills the remaining room with ineligible candidates, for their explanation', () => {
    const eligible = [person('e1', true), person('e2', true)];
    const ineligible = Array.from({ length: 10 }, (_unused, index) => person(`i${index}`, false));
    const shown = selectVisibleCandidates([...eligible, ...ineligible], 5);
    expect(shown).toHaveLength(5);
    expect(shown.filter((c) => c.eligible)).toHaveLength(2);
    expect(shown.filter((c) => !c.eligible)).toHaveLength(3);
  });

  it('caps the ineligible tail at zero once eligible candidates alone fill the cap', () => {
    const eligible = Array.from({ length: 12 }, (_unused, index) => person(`e${index}`, true));
    const ineligible = [person('i0', false)];
    const shown = selectVisibleCandidates([...eligible, ...ineligible], 12);
    expect(shown).toHaveLength(12);
    expect(shown.every((c) => c.eligible)).toBe(true);
  });

  it('passes an empty list through unchanged', () => {
    expect(selectVisibleCandidates([], 12)).toEqual([]);
  });
});
