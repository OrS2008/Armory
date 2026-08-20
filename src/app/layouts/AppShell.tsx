import { useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { Bell, LogOut, Menu, ShieldCheck, X } from 'lucide-react';
import { t } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { navItems, personalNavItem, type NavItem } from '@/components/layout/navigation';
import { useAuth } from '@/hooks/auth-context';
import { useNotifications } from '@/hooks/queries';
import { OfflineBanner } from '@/components/layout/OfflineBanner';

export function AppShell() {
  const { user, logout, can } = useAuth();
  const navigate = useNavigate();
  const notifications = useNotifications();
  const [menuOpen, setMenuOpen] = useState(false);

  const visible = navItems.filter((item) => !item.permission || can(item.permission));
  const items: NavItem[] = user?.personnelId ? [personalNavItem, ...visible] : visible;
  const unread = notifications.data?.unreadCount ?? 0;

  const handleLogout = async () => {
    await logout();
    await navigate('/login', { replace: true });
  };

  return (
    <div className="min-h-dvh bg-surface text-ink">
      <a
        href="#main"
        className="sr-only-focusable absolute z-50 m-2 rounded-md bg-brand-600 px-3 py-2 text-ink-inverse"
      >
        {t('app.skipToContent')}
      </a>

      <header className="sticky top-0 z-30 border-b border-border-subtle bg-surface-raised/95 backdrop-blur">
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
            <span className="hidden text-sm text-ink-muted sm:inline">
              {t('auth.loggedInAs', { name: user?.displayName ?? '' })}
            </span>
            <Button
              variant="ghost"
              size="sm"
              icon={<LogOut className="size-4" />}
              onClick={() => void handleLogout()}
            >
              <span className="hidden sm:inline">{t('auth.logout')}</span>
            </Button>
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
    </div>
  );
}
