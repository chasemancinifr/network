// Thin entry point. All app code lives in js/ — this file just boots the
// router and registers the service worker.
import { boot } from './js/router.js';

boot();

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
