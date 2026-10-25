// The preview itself. While the code is still being written, a stable shell page redraws itself from
// the partial HTML (styles first, so the page "comes into view"). Once the block is complete the
// finished page loads fresh so its scripts run. Both are sandboxed with no same-origin access and a
// policy that blocks every network request.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SHELL_DOC, buildDoc, partialHtml } from '../../lib/canvas.js';

const SANDBOX = 'allow-scripts'; // deliberately NOT allow-same-origin, allow-forms, allow-popups or allow-top-navigation

export default function SandboxFrame({ code, streaming, reloadKey = 0, title = 'Preview' }) {
  const frameRef = useRef(null);
  const latest = useRef(code);
  const ready = useRef(false);
  const timer = useRef(0);
  latest.current = code;
  const [escapes, setEscapes] = useState(0); // bumps when the page tried to navigate away

  const finalDoc = useMemo(() => (streaming ? '' : buildDoc(code)), [streaming, code]);

  const draw = useCallback(() => {
    timer.current = 0;
    const win = frameRef.current?.contentWindow;
    if (win && ready.current) win.postMessage({ html: partialHtml(latest.current) }, '*');
  }, []);

  // Live mode: wait for the shell, then redraw a few times a second.
  useEffect(() => {
    if (!streaming) return undefined;
    const onMsg = (e) => {
      if (e.source === frameRef.current?.contentWindow && e.data?.t === 'shell-ready') {
        ready.current = true;
        draw();
      }
    };
    window.addEventListener('message', onMsg);
    return () => {
      window.removeEventListener('message', onMsg);
      clearTimeout(timer.current);
      timer.current = 0;
      ready.current = false;
    };
  }, [streaming, reloadKey, draw]);
  useEffect(() => {
    if (!streaming || !ready.current || timer.current) return;
    timer.current = setTimeout(draw, 220);
  }, [code, streaming, draw]);

  // Final mode: the page's first load is expected; any later load means it navigated itself. Reset it.
  const loads = useRef(0);
  useEffect(() => {
    loads.current = 0;
  }, [finalDoc, reloadKey, escapes, streaming]);
  const onLoad = () => {
    if (streaming) return;
    loads.current += 1;
    if (loads.current > 1) setEscapes((n) => n + 1);
  };

  return (
    <iframe
      key={`${streaming ? 'live' : 'final'}-${reloadKey}-${escapes}`}
      ref={frameRef}
      className="cv-frame"
      title={title}
      sandbox={SANDBOX}
      referrerPolicy="no-referrer"
      allow="" // no camera, microphone, location, clipboard, payment, fullscreen…
      srcDoc={streaming ? SHELL_DOC : finalDoc}
      onLoad={onLoad}
    />
  );
}
