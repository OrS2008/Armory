import { LockKeyhole, ShieldCheck } from 'lucide-react';
import { Link, Outlet } from 'react-router-dom';

export function PublicShell() {
  return (
    <div className="public-shell">
      <a className="skip-link" href="#public-content">
        דלגו לתוכן הראשי
      </a>
      <header className="public-header">
        <Link className="public-brand" to="/">
          <span className="brand-mark">
            <ShieldCheck />
          </span>
          <span>
            <strong>Armory</strong>
            <small>רישום ומעקב ציוד אישי</small>
          </span>
        </Link>
        <Link className="admin-entry" to="/admin">
          <LockKeyhole /> כניסת מנהל
        </Link>
      </header>
      <main id="public-content">
        <Outlet />
      </main>
      <footer className="public-footer">
        <span>Armory</span>
        <span>מערכת מאובטחת לרישום ומעקב ציוד</span>
      </footer>
    </div>
  );
}
