import type { SessionUser } from '@shared/types';

/**
 * The last signed-in identity, remembered so the app can open without a
 * network. It is not a credential: the session cookie is, and the server
 * authorises every request against it. Writing a fabricated entry here grants
 * nothing — the first API call still comes back 401.
 */
const KEY = 'shabatzak.session';

export function rememberSession(user: SessionUser | null): void {
  try {
    if (user) localStorage.setItem(KEY, JSON.stringify(user));
    else localStorage.removeItem(KEY);
  } catch {
    // Storage can be refused outright; the app simply loses the convenience.
  }
}

export function rememberedSession(): SessionUser | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    const user = parsed as Partial<SessionUser>;
    return typeof user.id === 'string' && Array.isArray(user.permissions)
      ? (parsed as SessionUser)
      : null;
  } catch {
    return null;
  }
}
