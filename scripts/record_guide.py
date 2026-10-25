# Records the "add your own key" walkthrough on a phone-sized screen with a visible tap cursor.
# Writes the raw video plus cursor + caption timelines for the zoom-follow edit (scripts/edit_guide.py).
import asyncio, json, random, time, math
from playwright.async_api import async_playwright

URL = 'http://localhost:4175/'
OUT = '/tmp/guide'
VW, VH, DSF = 390, 844, 2

CURSOR_JS = """
(() => {
  const add = () => {
    if (document.getElementById('demo-cursor')) return;
    const c = document.createElement('div'); c.id = 'demo-cursor';
    c.style.cssText = 'position:fixed;left:0;top:0;width:34px;height:34px;margin:-17px 0 0 -17px;border-radius:50%;background:rgba(255,255,255,.28);border:2.5px solid #fff;box-shadow:0 2px 12px rgba(0,0,0,.55);z-index:2147483647;pointer-events:none;transition:transform .12s ease, background .12s;transform:translate(195px,600px)';
    document.documentElement.appendChild(c);
    let x = 195, y = 600;
    addEventListener('mousemove', e => { x = e.clientX; y = e.clientY; c.style.transform = `translate(${x}px,${y}px)`; }, true);
    addEventListener('mousedown', () => {
      c.style.transform = `translate(${x}px,${y}px) scale(.78)`; c.style.background = 'rgba(255,255,255,.6)';
      const r = document.createElement('div');
      r.style.cssText = `position:fixed;left:${x}px;top:${y}px;width:20px;height:20px;margin:-10px 0 0 -10px;border-radius:50%;border:2px solid rgba(255,255,255,.9);z-index:2147483646;pointer-events:none;transition:all .5s ease-out;opacity:1`;
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.width = r.style.height = '70px'; r.style.margin = '-35px 0 0 -35px'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
    addEventListener('mouseup', () => { c.style.transform = `translate(${x}px,${y}px)`; c.style.background = 'rgba(255,255,255,.28)'; }, true);
  };
  if (document.readyState === 'loading') addEventListener('DOMContentLoaded', add); else add();
})();
"""

REPLY = [
    {"choices": [{"delta": {"reasoning_content": "They just got here. Warm, a little teasing."}}]},
    {"choices": [{"delta": {"content": "*Rhett slides a mug across the counter before you even order.* "}}]},
    {"choices": [{"delta": {"content": "Took you long enough. Oat latte, extra foam, and before you ask, yes, I remembered."}}]},
    {"choices": [{"delta": {}, "finish_reason": "stop"}]},
    {"choices": [], "usage": {"completion_tokens": 60}},
]

async def main():
    log = {'cursor': [], 'captions': [], 'clicks': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--force-device-scale-factor=2'])  # makes the screencast full-res
        ctx = await b.new_context(viewport={'width': VW, 'height': VH}, device_scale_factor=DSF)
        t0 = time.time()
        T = lambda: time.time() - t0
        await ctx.add_init_script("""localStorage.setItem('charcoal:session', JSON.stringify({access_token:'demo', refresh_token:'demo', expires_at: Date.now()+3600e3, user_id:'demo-user', username:'minitrix'}));
          if (!localStorage.getItem('charcoal:settings')) localStorage.setItem('charcoal:settings', JSON.stringify({v:2, apiKey:'', repliesPerMessage:1, thinking:true, maxSentences:5}));""")
        async def status(route):
            await route.fulfill(json={'signedIn': True, 'enabled': True, 'owner': False, 'usedToday': 300000, 'dailyLimit': 300000}, headers={'Access-Control-Allow-Origin': '*'})
        await ctx.route('**/functions/v1/ai/status', status)
        await ctx.route('**/rest/v1/**', lambda r: r.fulfill(json=[], headers={'Access-Control-Allow-Origin': '*'}))
        await ctx.route('https://api.deepseek.com/v1/models', lambda r: r.fulfill(json={'object': 'list', 'data': [{'id': 'deepseek-flash'}, {'id': 'deepseek-v4-pro'}]}, headers={'Access-Control-Allow-Origin': '*'}))
        sse = ''.join(f"data: {json.dumps(c)}\n\n" for c in REPLY) + 'data: [DONE]\n\n'
        await ctx.route('https://api.deepseek.com/v1/chat/completions', lambda r: r.fulfill(body=sse, headers={'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*'}))

        pg = await ctx.new_page()
        # Chrome screencast at 2x (forced via launch flag): smooth and sharp. The cursor is drawn in the edit.
        import os, base64, shutil
        fdir = f'{OUT}/frames'; shutil.rmtree(fdir, ignore_errors=True); os.makedirs(fdir)
        frames = []
        cdp = await ctx.new_cdp_session(pg)
        async def on_frame(ev):
            i = len(frames)
            frames.append(T())
            open(f'{fdir}/{i:05d}.jpg', 'wb').write(base64.b64decode(ev['data']))
            try:
                await cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception:
                pass
        cdp.on('Page.screencastFrame', lambda ev: asyncio.ensure_future(on_frame(ev)))
        pos = [195.0, 600.0]
        async def move(x, y, dur=0.55):
            x0, y0 = pos; n = max(8, int(dur * 60))
            for i in range(1, n + 1):
                k = i / n; e = 1 - (1 - k) ** 3  # ease-out cubic
                cx, cy = x0 + (x - x0) * e, y0 + (y - y0) * e
                await pg.mouse.move(cx, cy); log['cursor'].append((T(), cx, cy))
                await asyncio.sleep(dur / n)
            pos[0], pos[1] = x, y
        async def tap(sel, pause=0.35):
            loc = pg.locator(sel).first
            await loc.scroll_into_view_if_needed()
            bb = await loc.bounding_box()
            await move(bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2)
            await asyncio.sleep(0.15)
            log['clicks'].append(T())
            await pg.mouse.down(); await asyncio.sleep(0.08); await pg.mouse.up()
            await asyncio.sleep(pause)
        def cap(text): log['captions'].append((T(), text))

        await pg.goto(URL); await pg.wait_for_selector('.limit-banner', timeout=15000)
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 90, 'everyNthFrame': 1})
        await asyncio.sleep(0.4)
        await pg.mouse.move(*pos); log['cursor'].append((T(), *pos))
        cap('Out of free AI for today? Use your own key')
        await asyncio.sleep(2.2)
        await move(250, 330, 0.7); await asyncio.sleep(0.5)  # glance at the banner
        cap('1  Tap the gear to open Settings')
        await asyncio.sleep(0.6)
        await tap('.topbar .provider-btn', 0.9)
        cap('2  Paste your DeepSeek key here')
        await tap('#ds-key', 0.3)
        key = 'sk-' + ''.join(random.choice('abcdef0123456789') for _ in range(32))
        await pg.keyboard.type(key, delay=18)
        await asyncio.sleep(0.6)
        cap('3  Tap Test connection')
        await tap('.modal-foot .btn-ghost', 1.4)
        await pg.wait_for_selector('.check.ok', timeout=5000); await asyncio.sleep(0.9)
        cap('4  Tap Save')
        await tap('.modal-foot .btn-primary', 1.2)
        cap('Done. No daily limit now')
        await asyncio.sleep(1.6)
        cap('Chat like normal')
        await tap('.tile-grid .tile-main >> nth=1', 1.0)
        await tap('textarea', 0.2)
        await pg.keyboard.type('hey, the usual?', delay=45)
        await asyncio.sleep(0.3)
        await tap('.composer button[aria-label="Send"], .composer .send-btn, .composer button[type=submit]', 2.6)
        await asyncio.sleep(1.2)
        log['end'] = T()
        await cdp.send('Page.stopScreencast')
        await asyncio.sleep(0.3)
        log['frames'] = frames
        json.dump(log, open(f'{OUT}/log.json', 'w'))
        print('frames', len(frames), 'dur', round(log['end'], 1), 'cursor pts', len(log['cursor']))
        await ctx.close()
        await b.close()
asyncio.run(main())
