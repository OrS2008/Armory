/*
 * Service worker for שבצ״ק.
 *
 * The point is a duty officer opening the app in a stairwell with no signal
 * and getting the app rather than the browser's error page. It is deliberately
 * NOT an offline data cache: a schedule changes, and a stale duty sheet
 * presented as current is worse than an honest failure. Only the shell and the
 * build's own immutable assets are cached; every /api request goes to the
 * network and is allowed to fail, which is what the app's offline banner and
 * error states are for.
 */
const VERSION = 'v1';
const SHELL = `shabatzak-shell-${VERSION}`;
const ASSETS = `shabatzak-assets-${VERSION}`;
const SHELL_URL = '/';

/**
 * Stores a copy that is not marked as redirected.
 *
 * `/index.html` redirects to `/` on this host, and a response carrying the
 * redirect flag is refused by the browser when it is used to answer a
 * navigation — the page fails with a bare network error even though the cache
 * hit. Rebuilding the response drops the flag.
 */
async function cacheShell(cache, response) {
  const body = await response.blob();
  await cache.put(
    SHELL_URL,
    new Response(body, {
      status: 200,
      statusText: 'OK',
      headers: { 'Content-Type': response.headers.get('Content-Type') ?? 'text/html' },
    }),
  );
}

/**
 * The scripts and stylesheets the shell cannot render without.
 *
 * Assets were cached only when the worker happened to intercept a request for
 * them, which meant a visit that installed the worker and then closed left
 * nothing behind: the next offline open served the shell and then failed to
 * fetch its own bundle, showing a blank page. The shell names its assets, so
 * they are fetched at install alongside it.
 */
function assetUrls(html) {
  return [...new Set(html.match(/\/assets\/[A-Za-z0-9._-]+/g) ?? [])];
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL);
      const response = await fetch(SHELL_URL, { cache: 'reload' });
      if (response.ok) await cacheShell(cache, response);
      // Nice to have, and never a reason to fail the install.
      await Promise.allSettled([cache.add('/manifest.webmanifest'), cache.add('/favicon.svg')]);
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(
        names
          .filter((name) => name !== SHELL && name !== ASSETS)
          .map((name) => caches.delete(name)),
      );
      // Hashed asset names accumulate across deploys and the old ones can never
      // be requested again. Emptying the asset cache on activation keeps it
      // bounded without tracking a manifest — and refilling it immediately,
      // from the shell this worker just cached, is what makes the promise true.
      await caches.delete(ASSETS);
      await precacheAssets();
      await self.clients.claim();
    })(),
  );
});

/**
 * Fetch the assets the cached shell names, before any client is claimed.
 *
 * They used to be cached only when the worker happened to intercept a request
 * for them, which is never on the visit that installs it: the page had already
 * loaded its bundle before the worker existed. A reader who opened the app once
 * and came back with no signal got the shell and then a blank screen, because
 * the shell's own script was not there. Individually rather than with addAll,
 * which is atomic — one asset that 404s must not discard the rest.
 */
async function precacheAssets() {
  const shell = await caches.match(SHELL_URL);
  if (!shell) return;
  const urls = assetUrls(await shell.text());
  if (urls.length === 0) return;
  const assets = await caches.open(ASSETS);
  await Promise.allSettled(urls.map((url) => assets.add(url)));
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;

  // A navigation is answered from the network when there is one, and from the
  // cached shell when there is not — the SPA then renders its own state.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          if (response.ok && !response.redirected) {
            const cache = await caches.open(SHELL);
            await cacheShell(cache, response.clone());
          }
          return response;
        } catch {
          const cached = await caches.match(SHELL_URL);
          return cached ?? Response.error();
        }
      })(),
    );
    return;
  }

  // Build output is content-hashed, so a hit is always the right file.
  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) {
          const cache = await caches.open(ASSETS);
          await cache.put(request, response.clone());
        }
        return response;
      })(),
    );
  }
});
