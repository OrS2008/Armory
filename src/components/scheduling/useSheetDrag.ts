import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Dragging on the duty sheet.
 *
 * Pointer events rather than HTML5 drag-and-drop, for one reason: the sheet is
 * read and rearranged on a phone, and HTML5 dragging does not exist on touch.
 * One code path then serves the mouse and the finger alike — but not with the
 * same gesture, because a finger has only one gesture and the page needs it.
 *
 * With a mouse, moving while the button is down can only mean dragging, so a
 * few pixels of travel start it. With a finger it means scrolling, which is
 * what most of the sheet is for; taking that away — as marking the handles
 * `touch-action: none` did — leaves a page that cannot be read on the device it
 * is read on. So touch waits for a deliberate press and hold, and any movement
 * before that hands the gesture back to the page as an ordinary scroll.
 */
const DRAG_THRESHOLD_PX = 6;
/** How long a finger must rest before the press is a drag rather than a scroll. */
const TOUCH_HOLD_MS = 400;
/** How far it may drift in that time and still count as resting. */
const TOUCH_HOLD_SLOP_PX = 8;

export interface DragItem<T> {
  /** What is being dragged, in the sheet's own terms. */
  payload: T;
  /** What the ghost under the finger says. */
  label: string;
}

export interface SheetDrag<T> {
  /** What is in the air, or null. */
  item: DragItem<T> | null;
  /** Where the ghost is, in client coordinates. */
  at: { x: number; y: number };
  /** Attach to the handle: begins tracking, and drags once the gesture says so. */
  start: (item: DragItem<T>, event: React.PointerEvent) => void;
  /** True while a drag is settling, so the handle's click can be ignored. */
  suppressClick: () => boolean;
}

export function useSheetDrag<T>(
  onDrop: (payload: T, point: { x: number; y: number }) => void,
): SheetDrag<T> {
  const [item, setItem] = useState<DragItem<T> | null>(null);
  const [at, setAt] = useState({ x: 0, y: 0 });
  // Refs, not state: these are read inside the pointer handlers, which are
  // registered once and must see the live values rather than the ones captured
  // when the press began.
  const pending = useRef<{ item: DragItem<T>; from: { x: number; y: number } } | null>(null);
  const dragged = useRef(false);
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const release = useRef<(() => void) | null>(null);

  // A press that outlives the component would keep listening on the window.
  useEffect(() => () => release.current?.(), []);

  const start = useCallback(
    (next: DragItem<T>, event: React.PointerEvent) => {
      // Only the primary button, and never a right-click menu.
      if (event.button !== 0) return;
      const touch = event.pointerType !== 'mouse';
      pending.current = { item: next, from: { x: event.clientX, y: event.clientY } };
      dragged.current = false;
      setAt({ x: event.clientX, y: event.clientY });

      const begin = () => {
        if (dragged.current || !pending.current) return;
        dragged.current = true;
        setItem(pending.current.item);
      };

      /*
       * Once the drag is under way the page must stop scrolling under it. The
       * handles carry no `touch-action`, so this is the only thing holding the
       * scroll off — and it works because a touch drag begins from a finger
       * that has been still, before the browser has committed to a pan.
       */
      const hold = (moveEvent: TouchEvent) => {
        if (dragged.current) moveEvent.preventDefault();
      };

      const move = (moveEvent: PointerEvent) => {
        const held = pending.current;
        if (!held) return;
        const travelled =
          Math.abs(moveEvent.clientX - held.from.x) + Math.abs(moveEvent.clientY - held.from.y);

        if (!dragged.current) {
          // A finger that moves before the hold is over meant to scroll, and
          // the page is welcome to the gesture.
          if (touch) {
            if (travelled > TOUCH_HOLD_SLOP_PX) cancel();
            return;
          }
          if (travelled < DRAG_THRESHOLD_PX) return;
          begin();
        }
        moveEvent.preventDefault();
        setAt({ x: moveEvent.clientX, y: moveEvent.clientY });
      };

      const stop = () => {
        if (holdTimer.current) clearTimeout(holdTimer.current);
        holdTimer.current = null;
        release.current = null;
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        window.removeEventListener('touchmove', hold);
      };

      const finish = (upEvent: PointerEvent) => {
        stop();
        const held = pending.current;
        pending.current = null;
        setItem(null);
        if (!held || !dragged.current) return;
        onDrop(held.item.payload, { x: upEvent.clientX, y: upEvent.clientY });
      };

      function cancel() {
        stop();
        pending.current = null;
        dragged.current = false;
        setItem(null);
      }

      release.current = cancel;
      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
      window.addEventListener('touchmove', hold, { passive: false });
      if (touch) holdTimer.current = setTimeout(begin, TOUCH_HOLD_MS);
    },
    [onDrop],
  );

  const suppressClick = useCallback(() => {
    if (!dragged.current) return false;
    // One click follows the release; swallow that one and no more.
    dragged.current = false;
    return true;
  }, []);

  return { item, at, start, suppressClick };
}

/** The element under the pointer that can accept this kind of drop, if any. */
export function dropTargetAt(
  point: { x: number; y: number },
  attribute: string,
): HTMLElement | null {
  const under = document.elementFromPoint(point.x, point.y);
  return under instanceof Element ? under.closest<HTMLElement>(`[${attribute}]`) : null;
}

/** Whether the pointer is in the top half of an element — insert above, or below. */
export function isAbove(element: HTMLElement, point: { x: number; y: number }): boolean {
  const box = element.getBoundingClientRect();
  return point.y < box.top + box.height / 2;
}
