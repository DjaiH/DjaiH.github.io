/* Register a service worker for offline play (GitHub Pages / any https host).
   Silently skipped on file:// and where sw.js isn't present (e.g. AppsGeyser single-file). */
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {/* offline cache unavailable — game still works */});
  });
}
