import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { navItems, personalNavItem } from '@/components/layout/navigation';
import { usePersonnel } from '@/hooks/queries';
import { useAuth } from '@/hooks/auth-context';

export interface PaletteAction {
  key: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

interface Item {
  key: string;
  group: string;
  label: string;
  hint?: string;
  icon?: ReactNode;
  run: () => void;
}

const normalise = (value: string) => value.trim().toLowerCase();

/**
 * One box for "where is that person" and "take me to that screen".
 *
 * The alternative is what the product had: nine nav links, and a scheduler who
 * knows a soldier's name having to guess which screen lists them. Opened with
 * Ctrl/Cmd-K, and from a button in the header for anyone without a keyboard.
 */
export function CommandPalette({
  open,
  onClose,
  actions,
}: {
  open: boolean;
  onClose: () => void;
  actions: PaletteAction[];
}) {
  const navigate = useNavigate();
  const { can, user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);

  // Only fetched while the palette is open: the roster is not needed to render
  // a screen nobody has asked for.
  const personnel = usePersonnel({}, open);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const cancel = (event: Event) => {
      event.preventDefault();
      onClose();
    };
    node.addEventListener('cancel', cancel);
    return () => node.removeEventListener('cancel', cancel);
  }, [onClose]);

  const items = useMemo<Item[]>(() => {
    const term = normalise(query);

    const screens: Item[] = [
      ...(user?.personnelId ? [personalNavItem] : []),
      ...navItems.filter((item) => !item.permission || can(item.permission)),
    ].map((item) => ({
      key: `screen:${item.to}`,
      group: t('palette.screens'),
      label: t(item.labelKey),
      run: () => void navigate(item.to),
    }));

    const people: Item[] =
      term === ''
        ? []
        : (personnel.data ?? [])
            .filter(
              (person) =>
                normalise(person.displayName).includes(term) ||
                normalise(person.externalId ?? '').includes(term) ||
                normalise(person.roleTitle ?? '').includes(term),
            )
            .slice(0, 8)
            .map((person) => ({
              key: `person:${person.id}`,
              group: t('palette.people'),
              label: person.displayName,
              ...(person.unitName ? { hint: person.unitName } : {}),
              // Lands on the roster already filtered to them, which is the
              // screen that can actually do something about a person.
              run: () => void navigate(`/personnel?q=${encodeURIComponent(person.displayName)}`),
            }));

    const quick: Item[] = actions.map((action) => ({
      key: `action:${action.key}`,
      group: t('palette.actions'),
      label: action.label,
      ...(action.hint ? { hint: action.hint } : {}),
      ...(action.icon ? { icon: action.icon } : {}),
      run: action.run,
    }));

    const matches = (item: Item) => term === '' || normalise(item.label).includes(term);
    return [...people, ...screens.filter(matches), ...quick.filter(matches)];
  }, [query, personnel.data, actions, can, navigate, user?.personnelId]);

  const choose = (item: Item | undefined) => {
    if (!item) return;
    onClose();
    setQuery('');
    item.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((current) => (items.length === 0 ? 0 : (current + 1) % items.length));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((current) =>
        items.length === 0 ? 0 : (current - 1 + items.length) % items.length,
      );
    } else if (event.key === 'Enter') {
      event.preventDefault();
      choose(items[active]);
    }
  };

  let lastGroup = '';

  return (
    <dialog
      ref={dialog}
      dir="rtl"
      aria-label={t('app.commandPalette')}
      className={cn(
        'mt-[10vh] w-[calc(100vw-2rem)] max-w-xl rounded-[var(--radius-card)] border border-border-subtle',
        'bg-surface-raised p-0 text-ink shadow-[var(--shadow-popover)] backdrop:bg-black/40',
      )}
      onClick={(event) => {
        if (event.target === dialog.current) onClose();
      }}
    >
      <div className="flex items-center gap-2 border-b border-border-subtle px-4 py-3">
        <Search className="size-4 shrink-0 text-ink-faint" aria-hidden />
        <input
          type="text"
          role="combobox"
          aria-expanded
          aria-controls="palette-list"
          aria-label={t('palette.placeholder')}
          placeholder={t('palette.placeholder')}
          className="w-full bg-transparent text-sm outline-none placeholder:text-ink-faint"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
        />
      </div>

      <ul
        id="palette-list"
        role="listbox"
        className="app-scrollbar max-h-[55vh] overflow-y-auto p-1"
      >
        {items.length === 0 ? (
          <li className="px-3 py-6 text-center text-sm text-ink-muted">{t('palette.empty')}</li>
        ) : (
          items.map((item, index) => {
            const header = item.group === lastGroup ? null : item.group;
            lastGroup = item.group;
            return (
              <li key={item.key}>
                {header ? (
                  <p className="px-3 pb-1 pt-2 text-xs font-semibold text-ink-faint">{header}</p>
                ) : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setActive(index)}
                  onClick={() => choose(item)}
                  className={cn(
                    'flex w-full items-center gap-2 rounded-[var(--radius-control)] px-3 py-2 text-start text-sm',
                    index === active ? 'bg-surface-sunken' : '',
                  )}
                >
                  {item.icon ? <span className="text-ink-faint">{item.icon}</span> : null}
                  <span className="min-w-0 flex-1 truncate font-medium text-ink">{item.label}</span>
                  {item.hint ? <span className="text-xs text-ink-faint">{item.hint}</span> : null}
                </button>
              </li>
            );
          })
        )}
      </ul>

      <p className="border-t border-border-subtle px-4 py-2 text-xs text-ink-faint">
        {t('palette.hint')}
      </p>
    </dialog>
  );
}
