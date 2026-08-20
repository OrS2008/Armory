import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { IconButton } from './IconButton';

interface DialogProps {
  open: boolean;
  title: string;
  description?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}

/**
 * Modal built on <dialog>, which gives us the top layer, Esc handling and a
 * focus trap without extra dependencies.
 */
export function Dialog({
  open,
  title,
  description,
  onClose,
  children,
  footer,
  size = 'md',
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const handleCancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener('cancel', handleCancel);
    return () => node.removeEventListener('cancel', handleCancel);
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      dir="rtl"
      aria-labelledby="dialog-title"
      className={cn(
        'w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-border-subtle bg-surface-raised p-0',
        'text-ink shadow-[var(--shadow-popover)] backdrop:bg-black/40',
        size === 'lg' ? 'max-w-3xl' : 'max-w-xl',
      )}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      <div className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
        <div>
          <h2 id="dialog-title" className="text-base font-semibold">
            {title}
          </h2>
          {description ? <p className="mt-0.5 text-sm text-ink-muted">{description}</p> : null}
        </div>
        <IconButton label={t('app.close')} icon={<X className="size-4" />} onClick={onClose} />
      </div>
      <div className="app-scrollbar max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 border-t border-border-subtle px-5 py-3">
          {footer}
        </div>
      ) : null}
    </dialog>
  );
}
