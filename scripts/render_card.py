# Animated "get a DeepSeek key" card for step 1, lines timed to the voiceover. 720x1558 (the screen area).
import asyncio, base64, json, os, shutil, time
from playwright.async_api import async_playwright
steps = json.load(open('/home/claude/charcoal/scripts/guide_script.json'))
durs = json.load(open('/tmp/guide/vo/durations.json'))
VO_OFFSET, PAD = 0.3, 0.55
s = next(x for x in steps if x['id'] == 'getkey')
def at(phrase): return VO_OFFSET + durs['getkey'] * s['say'].lower().find(phrase) / len(s['say'])
ROWS = [
    (at('head to platform'), 'Go to', 'platform.deepseek.com'),
    (at('add a little credit'), 'Add a little credit', '$2 lasts a long time'),
    (at('then go to api keys'), 'API keys', 'Create new API key'),
    (at('copy it'), 'Copy it', 'starts with sk-'),
]
LEN = VO_OFFSET + durs['getkey'] + PAD
rows_html = ''.join(f'<div class="row" style="animation-delay:{t:.2f}s"><span class="n">{i+1}</span><div><b>{a}</b><span>{b}</span></div></div>' for i, (t, a, b) in enumerate(ROWS))
HTML = f"""<!doctype html><html><head><meta charset="utf-8"><style>
html,body{{margin:0;height:100%;background:#100d0d;overflow:hidden;font-family:'Geist','Inter',system-ui,sans-serif;color:#fafafa}}
.glow{{position:absolute;width:560px;height:560px;left:50%;top:30%;transform:translate(-50%,-50%);border-radius:50%;background:radial-gradient(circle,rgba(120,140,255,.22),transparent 62%)}}
.wrap{{position:absolute;inset:0;padding:70px 28px;display:flex;flex-direction:column;gap:30px}}
.key{{width:76px;height:76px;border-radius:24px;display:grid;place-items:center;background:linear-gradient(150deg,#3a3a44,#17171b);box-shadow:0 0 0 2px #2e2e35;font-size:34px;animation:pop .6s cubic-bezier(.2,1.4,.4,1) both}}
h1{{margin:0;font-size:40px;letter-spacing:-.03em;line-height:1.05;animation:up .5s .15s both}}
p.sub{{margin:-14px 0 0;color:#a2a2ac;font-size:19px;animation:up .5s .3s both}}
.rows{{display:grid;gap:16px;margin-top:10px}}
.row{{display:flex;gap:16px;align-items:center;padding:18px;border-radius:22px;background:rgba(255,255,255,.05);box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);opacity:0;transform:translateY(14px);animation:up .5s cubic-bezier(.2,.8,.2,1) both}}
.row .n{{flex:none;width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#fafafa;color:#18181b;font-weight:700;font-size:19px}}
.row b{{display:block;font-size:22px;letter-spacing:-.01em}}
.row span{{display:block;color:#a2a2ac;font-size:17px;margin-top:3px;font-family:'Geist Mono',ui-monospace,monospace}}
@keyframes up{{to{{opacity:1;transform:none}}}} @keyframes pop{{from{{opacity:0;transform:scale(.6)}}}}
</style></head><body><div class="glow"></div><div class="wrap"><div class="key">🔑</div><h1>Get a DeepSeek key</h1><p class="sub">Takes about a minute.</p><div class="rows">{rows_html}</div></div></body></html>"""

async def main():
    out = '/tmp/guide2/card'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--force-device-scale-factor=2'])
        ctx = await b.new_context(viewport={'width': 360, 'height': 779}, device_scale_factor=2)
        pg = await ctx.new_page(); await pg.set_content('<body style="background:#100d0d">')
        cdp = await ctx.new_cdp_session(pg); frames = []; t0 = time.time()
        async def on_frame(ev):
            i = len(frames); frames.append(time.time() - t0)
            open(f'{out}/{i:05d}.jpg', 'wb').write(base64.b64decode(ev['data']))
            try: await cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception: pass
        cdp.on('Page.screencastFrame', lambda ev: asyncio.ensure_future(on_frame(ev)))
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92})
        await asyncio.sleep(0.3); start = time.time() - t0
        await pg.set_content(HTML)
        await asyncio.sleep(LEN + 0.2)
        await cdp.send('Page.stopScreencast'); await asyncio.sleep(0.2)
        json.dump({'frames': [f - start for f in frames], 'len': LEN}, open(f'{out}/log.json', 'w'))
        print('card frames', len(frames), 'len', round(LEN, 1), [round(r[0], 1) for r in ROWS])
        await b.close()
asyncio.run(main())
