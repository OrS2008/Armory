import {
  Bell,
  Boxes,
  ClipboardList,
  Fuel,
  FileBarChart,
  HardHat,
  KeyRound,
  LayoutDashboard,
  Radio,
  Shield,
  PackageSearch,
  ShieldCheck,
  Warehouse,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link, Navigate, NavLink, Outlet } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { IconButton } from '@/components/ui/IconButton';
import { api, ApiError } from '@/services/api';

const nav = [
  { to: '/admin', label: 'סקירה', icon: LayoutDashboard },
  { to: '/admin/approvals', label: 'ממתין לאישור', icon: ClipboardList },
  { to: '/admin/soldiers', label: 'חיילים', icon: Users },
  { to: '/admin/equipment', label: 'מעקב ציוד', icon: Shield },
  { to: '/admin/shortages', label: 'בקשות חוסר', icon: PackageSearch },
  { to: '/admin/faults', label: 'תקלות בינוי', icon: HardHat },
  { to: '/admin/inventory', label: 'מלאי', icon: Boxes },
  { to: '/admin/armory', label: 'ארמון', icon: Warehouse },
  { to: '/admin/communications', label: 'דוח קשר', icon: Radio },
  { to: '/admin/tzelem', label: 'דו״ח צל״ם', icon: ShieldCheck },
  { to: '/admin/ammunition', label: 'תחמושת ואלפא', icon: Boxes },
  { to: '/admin/vehicles', label: 'רכבים', icon: Fuel },
  { to: '/admin/licenses', label: 'רישיונות', icon: KeyRound },
  { to: '/admin/reports', label: 'דוחות', icon: FileBarChart },
  { to: '/admin/security', label: 'אבטחה', icon: ShieldCheck },
];

export function AdminShell() {
  const [online, setOnline] = useState(navigator.onLine);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    addEventListener('online', on);
    addEventListener('offline', off);
    return () => {
      removeEventListener('online', on);
      removeEventListener('offline', off);
    };
  }, []);

  const session = useQuery({ queryKey: ['session'], queryFn: api.me, retry: false });
  if (session.isLoading)
    return (
      <div className="session-loading">
        <span className="brand-mark">
          <ShieldCheck />
        </span>
        <p>טוען את סביבת הניהול…</p>
      </div>
    );
  if (session.error instanceof ApiError && session.error.status === 401)
    return <Navigate to="/admin/login" replace />;
  if (session.isError)
    return (
      <div className="fatal-state">
        <h1>לא ניתן לטעון את סביבת הניהול</h1>
        <p>{session.error instanceof Error ? session.error.message : 'אירעה שגיאה'}</p>
        <button onClick={() => void session.refetch()}>ניסיון נוסף</button>
      </div>
    );
  if (!session.data) return null;
  const currentUser = session.data.user;

  return (
    <div className="admin-shell">
      <a className="skip-link" href="#main-content">
        דלגו לתוכן הראשי
      </a>
      <header className="admin-header">
        <Link className="admin-brand" to="/admin" aria-label="Armory — פאנל ניהול">
          <span className="brand-mark">
            <ShieldCheck />
          </span>
          <span>
            <strong>Armory</strong>
            <small>פאנל ניהול</small>
          </span>
        </Link>
        <div className="header-spacer" />
        <span className="connection-status" title={online ? 'המערכת מחוברת' : 'אין חיבור'}>
          <span className={`connection-dot ${online ? '' : 'is-offline'}`} />
          {online ? 'מחובר' : 'לא מחובר'}
        </span>
        <IconButton label="התראות — אין התראות חדשות">
          <Bell />
        </IconButton>
        <button className="account-button" type="button" aria-label="תפריט משתמש">
          <span>או</span>
          <span>
            <strong>{currentUser.displayName}</strong>
            <small>
              {currentUser.role === 'admin'
                ? 'מנהל מערכת'
                : currentUser.role === 'editor'
                  ? 'עריכה'
                  : 'צפייה'}
            </small>
          </span>
        </button>
      </header>
      <nav className="admin-tabs" aria-label="ניווט ניהול">
        <div>
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/admin'}>
              <Icon aria-hidden="true" />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
      <main id="main-content" className="admin-main">
        <Outlet />
      </main>
      <nav className="mobile-bottom-nav" aria-label="ניווט מהיר">
        {nav.slice(0, 5).map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/admin'}>
            <Icon aria-hidden="true" />
            <span>
              {label === 'ציוד והחתמות' ? 'ציוד' : label === 'בקשות חוסר' ? 'חוסרים' : label}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
