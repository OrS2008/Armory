/**
 * Light or dark, and who decided.
 *
 * The resolved mode is written onto <html data-theme>, so the stylesheet needs
 * one rule rather than a copy of the palette per source of truth. The CSS also
 * honours `prefers-color-scheme` on its own, which covers the moment before
 * this module runs — the page's Content-Security-Policy forbids the inline
 * script that would otherwise settle it before first paint.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';

const STORAGE_KEY = 'shabatzak.theme';
const DARK_QUERY = '(prefers-color-scheme: dark)';

export function readThemeChoice(): ThemeChoice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'system';
  } catch {
    // Private browsing can refuse storage outright; the device preference wins.
    return 'system';
  }
}

export function systemPrefersDark(): boolean {
  return window.matchMedia?.(DARK_QUERY).matches ?? false;
}

export function resolveTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return choice;
}

export function applyTheme(choice: ThemeChoice): void {
  document.documentElement.dataset.theme = resolveTheme(choice);
}

export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    if (choice === 'system') localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // A preference that cannot be saved still applies for this visit.
  }
}

/** Re-resolves while the reader is following the device. */
export function watchSystemTheme(onChange: () => void): () => void {
  const list = window.matchMedia?.(DARK_QUERY);
  if (!list) return () => {};
  list.addEventListener('change', onChange);
  return () => list.removeEventListener('change', onChange);
}
