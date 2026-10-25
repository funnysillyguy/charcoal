# Renders the Charcoal end card (logo + wordmark) at 720x1676 via Chrome screencast at 2x.
import asyncio, base64, json, os, shutil, time
from playwright.async_api import async_playwright

HTML = """<!doctype html><html><head><meta charset="utf-8"><style>
html,body{margin:0;height:100%;background:#100d0d;overflow:hidden;font-family:'Geist','Inter',system-ui,sans-serif;color:#fafafa}
.wrap{position:absolute;inset:0;display:grid;place-items:center}
.glow{position:absolute;width:520px;height:520px;left:50%;top:44%;transform:translate(-50%,-50%);border-radius:50%;
  background:radial-gradient(circle,rgba(255,140,60,.28),rgba(255,140,60,0) 62%);opacity:0;animation:glow 1.6s .1s ease-out forwards}
.stack{position:relative;display:grid;justify-items:center;gap:22px;margin-top:-40px}
.mark{position:relative;width:104px;height:104px;border-radius:32px;background:linear-gradient(150deg,#3a3a44 0%,#17171b 70%);
  box-shadow:inset 0 2px 0 rgba(255,255,255,.08),0 0 0 2px #2e2e35,0 30px 60px -20px rgba(0,0,0,.9);overflow:hidden;
  opacity:0;transform:scale(.6) rotate(-8deg);animation:pop .7s .15s cubic-bezier(.2,1.4,.4,1) forwards}
.mark::after{content:'';position:absolute;left:18px;right:14px;top:50%;height:13px;border-radius:13px;transform:rotate(-18deg) scaleX(0);
  transform-origin:left center;background:linear-gradient(90deg,#ff8a3d,#ffd29a 60%,#ff8a3d);
  box-shadow:0 0 26px 5px rgba(255,150,70,.75);animation:ember .55s .6s cubic-bezier(.3,.9,.3,1) forwards, breathe 2.4s 1.2s ease-in-out infinite}
.word{font-size:62px;font-weight:700;letter-spacing:-.035em;opacity:0;transform:translateY(16px);animation:up .6s .75s cubic-bezier(.2,.8,.2,1) forwards}
.tag{font-size:21px;color:#a2a2ac;opacity:0;transform:translateY(10px);animation:up .6s 1.05s cubic-bezier(.2,.8,.2,1) forwards}
.url{position:absolute;bottom:92px;left:0;right:0;text-align:center;font-size:17px;color:#d6d6d8;opacity:0;animation:up .6s 1.35s ease-out forwards}
.url span{padding:10px 18px;border-radius:999px;background:rgba(255,255,255,.06);box-shadow:0 0 0 1px rgba(255,255,255,.08)}
@keyframes pop{to{opacity:1;transform:none}}
@keyframes ember{to{transform:rotate(-18deg) scaleX(1)}}
@keyframes breathe{50%{box-shadow:0 0 34px 8px rgba(255,150,70,.95)}}
@keyframes up{to{opacity:1;transform:none}}
@keyframes glow{to{opacity:1}}
</style></head><body><div class="wrap"><div class="glow"></div><div class="stack"><div class="mark"></div><div class="word">charcoal</div><div class="tag">Chat with anyone.</div></div>
<div class="url"><span>funnysillyguy.github.io/charcoal</span></div></div></body></html>"""

async def main():
    out = '/tmp/guide/outro'; shutil.rmtree(out, ignore_errors=True); os.makedirs(out)
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--force-device-scale-factor=2'])
        ctx = await b.new_context(viewport={'width': 360, 'height': 838}, device_scale_factor=2)
        pg = await ctx.new_page()
        await pg.set_content('<html><body style="background:#100d0d"></body></html>')
        cdp = await ctx.new_cdp_session(pg)
        frames = []; t0 = time.time()
        async def on_frame(ev):
            i = len(frames); frames.append(time.time() - t0)
            open(f'{out}/{i:05d}.jpg', 'wb').write(base64.b64decode(ev['data']))
            try: await cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception: pass
        cdp.on('Page.screencastFrame', lambda ev: asyncio.ensure_future(on_frame(ev)))
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 92})
        await asyncio.sleep(0.3)
        start = time.time() - t0
        await pg.set_content(HTML)
        await asyncio.sleep(3.6)
        await cdp.send('Page.stopScreencast'); await asyncio.sleep(0.2)
        json.dump({'frames': [f - start for f in frames]}, open(f'{out}/log.json', 'w'))
        print('outro frames', len(frames))
        await b.close()
asyncio.run(main())
