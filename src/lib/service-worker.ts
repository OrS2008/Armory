/**
 * Registers the shell cache. Production only: in development the dev server
 * serves modules the worker has no business holding on to.
 */
export function registerServiceWorker(): void {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;
  window.addEventListener('load', () => {
    void navigator.serviceWorker.register('/sw.js').catch(() => {
      // An unavailable worker costs offline support, nothing else.
    });
  });
}
