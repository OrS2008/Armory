import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/cn';
import { buttonClass } from './button-styles';

export interface MenuAction {
  key: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Overflow menu for actions that are real but rare. Keeping them out of the
 * toolbar is the whole point: a row of ten equal-weight buttons tells nobody
 * which one they are supposed to press.
 */
export function MenuButton({
  label,
  actions,
  className,
  ariaLabel,
}: {
  label: string;
  actions: MenuAction[];
  className?: string;
  /** Use when the visible label is a person's name or otherwise varies: the
   *  button's accessible name should say what the menu is. */
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (!wrapper.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', close);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  if (actions.length === 0) return null;

  return (
    <div ref={wrapper} className="relative">
      <button
        type="button"
        aria-haspopup="menu"
        {...(ariaLabel ? { 'aria-label': ariaLabel } : {})}
        aria-expanded={open}
        aria-controls={menuId}
        className={buttonClass('secondary', 'sm', className)}
        onClick={() => setOpen((current) => !current)}
      >
        {label}
        <ChevronDown
          className={cn('size-4 transition-transform', open && 'rotate-180')}
          aria-hidden
        />
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          className={cn(
            // Anchored at the start edge: in RTL `end-0` pinned the panel's
            // left edge to the button and let it grow rightward, straight off
            // the side of a phone screen. The width cap keeps it on screen
            // whichever edge the button happens to sit near.
            'absolute start-0 z-40 mt-1 w-64 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)]',
            'border border-border-subtle bg-surface-raised p-1 shadow-[var(--shadow-popover)]',
          )}
        >
          {actions.map((action) => (
            <button
              key={action.key}
              type="button"
              role="menuitem"
              disabled={action.disabled}
              onClick={() => {
                setOpen(false);
                action.onSelect();
              }}
              className={cn(
                'flex w-full items-start gap-2 rounded-[var(--radius-control)] px-3 py-2 text-start',
                'text-sm text-ink transition-colors hover:bg-surface-sunken',
                'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent',
              )}
            >
              {action.icon ? <span className="mt-0.5 text-ink-muted">{action.icon}</span> : null}
              <span className="min-w-0">
                <span className="block font-medium">{action.label}</span>
                {action.hint ? (
                  <span className="block text-xs text-ink-faint">{action.hint}</span>
                ) : null}
              </span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
