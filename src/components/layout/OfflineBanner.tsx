import { useEffect, useState } from 'react';
import { CloudOff } from 'lucide-react';
import { formatTime } from '@shared/format';
import { t } from '@/i18n';

/**
 * Connectivity is unreliable on mobile, so the UI states plainly when what is
 * on screen may be stale (plan section 23).
 */
export function OfflineBanner() {
  const [online, setOnline] = useState(() => navigator.onLine);
  const [lastOnlineAt, setLastOnlineAt] = useState(() => Date.now());

  useEffect(() => {
    const goOnline = () => {
      setOnline(true);
      setLastOnlineAt(Date.now());
    };
    const goOffline = () => setOnline(false);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
    };
  }, []);

  if (online) return null;

  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-[var(--radius-control)] border border-warning/30 bg-warning-soft px-3 py-2 text-sm text-warning"
    >
      <CloudOff className="size-4" aria-hidden />
      <span>{t('app.offline')}</span>
      <span className="text-xs">{t('app.lastSync', { time: formatTime(lastOnlineAt) })}</span>
    </div>
  );
}
