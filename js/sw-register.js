/* Register a service worker for offline play (GitHub Pages / any https host).
   Silently skipped on file:// and where sw.js isn't present (e.g. AppsGeyser single-file). */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {/* offline cache unavailable — game still works */});
  });
}

/* Hard refresh: drop the cached app shell and re-fetch the latest version.
   Game progress lives in localStorage and is NOT touched. */
window.hardRefresh = async function () {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister()));
    }
    if (window.caches && caches.keys) {
      const keys = await caches.keys();
      await Promise.all(keys.map(k => caches.delete(k)));
    }
  } catch (e) { /* ignore — reload anyway */ }
  // Cache-busting query so the navigation itself isn't served from any cache.
  location.replace(location.pathname + '?u=' + Date.now());
};

/* Menu button entry point — confirm first via the shared Modal. */
window.menuHardRefresh = function () {
  if (window.Modal && Modal.show) {
    Modal.show({
      title: '🔄 Hard Refresh',
      body: 'Reload and fetch the latest version of the app.<br><br>Your saved progress is kept — only the cached files are cleared.',
      actions: [
        { label: 'Cancel' },
        { label: '🔄 Refresh now', cls: 'btn-primary', fn: () => window.hardRefresh() }
      ]
    });
  } else {
    window.hardRefresh();
  }
};

