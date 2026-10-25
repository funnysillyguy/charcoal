// Notices when a newer Charcoal is live. GitHub Pages lets browsers keep the old page for up to
// 10 minutes, so after a deploy people can be running yesterday's code without knowing it.
import { useEffect, useState } from 'react';

const current = () => document.querySelector('script[type="module"][src*="assets/index-"]')?.getAttribute('src')?.match(/index-[\w-]+\.js/)?.[0] || '';

async function latest() {
  const res = await fetch(`./index.html?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return '';
  return (await res.text()).match(/assets\/(index-[\w-]+\.js)/)?.[1] || '';
}

/** true once the server has a different build than the one running. */
export function useUpdateAvailable() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const mine = current();
    if (!mine) return undefined; // single-file preview builds have nothing to compare
    let dead = false;
    const check = async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const live = await latest();
        if (!dead && live && live !== mine) setReady(true);
      } catch {
        /* offline */
      }
    };
    const first = setTimeout(check, 4000);
    const timer = setInterval(check, 90_000);
    document.addEventListener('visibilitychange', check);
    return () => {
      dead = true;
      clearTimeout(first);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', check);
    };
  }, []);
  return ready;
}
