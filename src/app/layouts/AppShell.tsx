import { useEffect, useMemo, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, KeyRound, LogOut, Menu, Moon, Search, ShieldCheck, Sun, X } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { MenuButton } from '@/components/ui/MenuButton';
import { IconButton } from '@/components/ui/IconButton';
import { navItems, personalNavItem, type NavItem } from '@/components/layout/navigation';
import { useAuth } from '@/hooks/auth-context';
import { useNotifications } from '@/hooks/queries';
import { useTheme } from '@/hooks/useTheme';
import { OfflineBanner } from '@/components/layout/OfflineBanner';
import { PasswordDialog } from '@/features/auth/PasswordDialog';
import { MfaDialog } from '@/features/auth/MfaDialog';
import { CommandPalette, type PaletteAction } from '@/components/command/CommandPalette';

export function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const theme = useTheme();
  const [menuOpen, setMenuOpen] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [managingMfa, setManagingMfa] = useState(false);

  const visible = navItems.filter((item) => !item.permission || can(item.permission));
  const items: NavItem[] = user?.personnelId ? [personalNavItem, ...visible] : visible;
  const unread = notifications.data?.unreadCount ?? 0;

  // Ctrl/Cmd-K anywhere, including from inside a field: it is the shortcut
  // people already have in their fingers, and it is not an editing key.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || !(event.metaKey || event.ctrlKey)) return;
      event.preventDefault();
      setPaletteOpen((open) => !open);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleLogout = async () => {
    await logout();
    await navigate('/login', { replace: true });
  };

  const paletteActions = useMemo<PaletteAction[]>(
    () => [
      {
        key: 'password',
        label: t('account.changePassword'),
        run: () => setChangingPassword(true),
      },
      {
        key: 'theme',
        label: theme.resolved === 'dark' ? t('theme.toLight') : t('theme.toDark'),
        run: () => theme.select(theme.resolved === 'dark' ? 'light' : 'dark'),
      },
      { key: 'logout', label: t('auth.logout'), run: () => void handleLogout() },
    ],
    // handleLogout closes over `navigate` and `logout`, both stable enough that
    // rebuilding the list on every render would only churn the palette.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [theme.resolved],
  );

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <a
        href="#main"
        className="sr-only-focusable absolute z-50 m-2 rounded-md bg-brand-600 px-3 py-2 text-ink-inverse"
      >
        {t('app.skipToContent')}
      </a>

      <header className="no-print sticky top-0 z-30 border-b border-border-subtle bg-surface-raised/95 backdrop-blur">
        <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
          <IconButton
            className="lg:hidden"
            label={menuOpen ? t('app.closeMenu') : t('app.openMenu')}
            icon={menuOpen ? <X className="size-5" /> : <Menu className="size-5" />}
            onClick={() => setMenuOpen((open) => !open)}
            aria-expanded={menuOpen}
          />
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-6 text-brand-600" aria-hidden />
            <span className="text-lg font-semibold">{t('app.name')}</span>
          </div>

          <div className="ms-auto flex items-center gap-1">
            <IconButton
              label={t('palette.open')}
              icon={<Search className="size-5" />}
              onClick={() => setPaletteOpen(true)}
            />
            <NavLink
              to="/notifications"
              className="relative inline-flex size-9 items-center justify-center rounded-[var(--radius-control)] text-ink-muted hover:bg-surface-sunken"
              aria-label={t('nav.notifications')}
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 ? (
                <span className="ltr-inline absolute -top-0.5 -end-0.5 min-w-4 rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-ink-inverse">
                  {unread}
                </span>
              ) : null}
            </NavLink>
            <MenuButton
              className="max-w-40"
              ariaLabel={t('nav.account')}
              label={user?.displayName ?? t('nav.account')}
              actions={[
                {
                  key: 'password',
                  label: t('account.changePassword'),
                  icon: <KeyRound className="size-4" />,
                  onSelect: () => setChangingPassword(true),
                },
                {
                  key: 'mfa',
                  label: t('mfa.title'),
                  hint: user?.mfaEnabled ? t('mfa.statusOn') : t('mfa.statusOff'),
                  icon: <ShieldCheck className="size-4" />,
                  onSelect: () => setManagingMfa(true),
                },
                {
                  key: 'theme',
                  label: theme.resolved === 'dark' ? t('theme.toLight') : t('theme.toDark'),
                  ...(theme.choice === 'system' ? { hint: t('theme.following') } : {}),
                  icon:
                    theme.resolved === 'dark' ? (
                      <Sun className="size-4" />
                    ) : (
                      <Moon className="size-4" />
                    ),
                  onSelect: () => theme.select(theme.resolved === 'dark' ? 'light' : 'dark'),
                },
                ...(theme.choice === 'system'
                  ? []
                  : [
                      {
                        key: 'theme-system',
                        label: t('theme.followDevice'),
                        onSelect: () => theme.select('system'),
                      },
                    ]),
                {
                  key: 'logout',
                  label: t('auth.logout'),
                  icon: <LogOut className="size-4" />,
                  onSelect: () => void handleLogout(),
                },
              ]}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto flex w-full max-w-[110rem] gap-0">
        <nav
          aria-label={t('app.name')}
          className={cn(
            'fixed inset-y-14 end-0 z-20 w-64 shrink-0 border-s border-border-subtle bg-surface-raised p-3',
            'transition-transform lg:sticky lg:top-14 lg:h-[calc(100dvh-3.5rem)]',
            // Closed drawer is hidden from pointers and assistive tech, not
            // merely slid off screen — otherwise it swallows taps on mobile.
            menuOpen ? 'translate-x-0' : 'invisible translate-x-full pointer-events-none',
            'lg:visible lg:translate-x-0 lg:pointer-events-auto',
          )}
        >
          <ul className="flex flex-col gap-0.5">
            {items.map((item) => (
              <li key={item.to}>
                <NavLink
                  to={item.to}
                  onClick={() => setMenuOpen(false)}
                  className={({ isActive }) =>
                    cn(
                      'flex items-center gap-3 rounded-[var(--radius-control)] px-3 py-2 text-sm font-medium transition-colors',
                      isActive
                        ? 'bg-brand-50 text-brand-700'
                        : 'text-ink-muted hover:bg-surface-sunken hover:text-ink',
                    )
                  }
                >
                  <item.icon className="size-4.5 shrink-0" aria-hidden />
                  {t(item.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <main id="main" className="min-w-0 flex-1 px-3 pb-24 pt-4 sm:px-5 lg:pb-8">
          <OfflineBanner />
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom navigation with large tap targets (plan section 11). */}
      <nav
        aria-label={t('app.name')}
        className="fixed inset-x-0 bottom-0 z-30 grid grid-flow-col border-t border-border-subtle bg-surface-raised pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        {items
          .filter((item) => item.primary)
          .map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  'flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-medium',
                  isActive ? 'text-brand-700' : 'text-ink-muted',
                )
              }
            >
              <item.icon className="size-5" aria-hidden />
              {t(item.labelKey)}
            </NavLink>
          ))}
      </nav>

      {/* Mounted only while open: a hidden password form on every screen is
          something browsers offer to fill, and something tests trip over. */}
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        actions={paletteActions}
      />

      {/* Mounted only while open: a hidden password form on every screen is
          something browsers offer to fill, and something tests trip over. */}
      {changingPassword ? <PasswordDialog open onClose={() => setChangingPassword(false)} /> : null}
      {managingMfa ? <MfaDialog open onClose={() => setManagingMfa(false)} /> : null}
    </div>
  );
}
