import { useCallback, useRef, useState } from 'react';

/**
 * Dragging on the duty sheet.
 *
 * Pointer events rather than HTML5 drag-and-drop, for one reason: the sheet is
 * read and rearranged on a phone, and HTML5 dragging does not exist on touch.
 * One code path then serves the mouse and the finger alike.
 *
 * A press is not a drag until it has travelled — a title bar is also the button
 * that opens the post, and a thumb never presses perfectly still. Below the
 * threshold nothing happens and the click goes through; above it the click is
 * swallowed, because the person meant to move the card, not open it.
 */
const DRAG_THRESHOLD_PX = 6;

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
  /** Attach to the handle: begins tracking, and drags once past the threshold. */
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

  const start = useCallback(
    (next: DragItem<T>, event: React.PointerEvent) => {
      // Only the primary button, and never a right-click menu.
      if (event.button !== 0) return;
      pending.current = { item: next, from: { x: event.clientX, y: event.clientY } };
      dragged.current = false;
      setAt({ x: event.clientX, y: event.clientY });

      const move = (moveEvent: PointerEvent) => {
        const held = pending.current;
        if (!held) return;
        const travelled =
          Math.abs(moveEvent.clientX - held.from.x) + Math.abs(moveEvent.clientY - held.from.y);
        if (!dragged.current && travelled < DRAG_THRESHOLD_PX) return;
        // Past the threshold the gesture is a drag: stop the page scrolling
        // under the finger, and show the ghost.
        if (!dragged.current) {
          dragged.current = true;
          setItem(held.item);
        }
        moveEvent.preventDefault();
        setAt({ x: moveEvent.clientX, y: moveEvent.clientY });
      };

      const finish = (upEvent: PointerEvent) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        const held = pending.current;
        pending.current = null;
        setItem(null);
        if (!held || !dragged.current) return;
        onDrop(held.item.payload, { x: upEvent.clientX, y: upEvent.clientY });
      };

      const cancel = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', finish);
        window.removeEventListener('pointercancel', cancel);
        pending.current = null;
        dragged.current = false;
        setItem(null);
      };

      window.addEventListener('pointermove', move, { passive: false });
      window.addEventListener('pointerup', finish);
      window.addEventListener('pointercancel', cancel);
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
