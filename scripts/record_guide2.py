# Records the narrated walkthrough: each step lasts as long as its voiceover, and taps land as the voice says them.
# Needs /tmp/guide/vo/durations.json (scripts/voiceover.py). Writes frames + log for scripts/edit_guide2.py.
import asyncio, base64, json, os, random, shutil, time
from playwright.async_api import async_playwright

URL = 'http://localhost:4175/'
OUT = '/tmp/guide2'
VO_OFFSET = 0.3  # voice starts this long after each step begins
PAD = 0.55       # breathing room after the voice ends
steps = json.load(open('/home/claude/charcoal/scripts/guide_script.json'))
durs = json.load(open('/tmp/guide/vo/durations.json'))

REPLY_TEXT = ('*Rhett slides a mug across the counter before you even order.* Took you long enough. '
              'Oat latte, extra foam, and before you ask, yes, I remembered.')
SSE = ''.join(f"data: {json.dumps(c)}\n\n" for c in [
    {"choices": [{"delta": {"content": REPLY_TEXT}}]}, {"choices": [{"delta": {}, "finish_reason": "stop"}]}]) + 'data: [DONE]\n\n'

def at(step_id, phrase):
    """Seconds into a step's voiceover when `phrase` is spoken (proportional to characters)."""
    s = next(x for x in steps if x['id'] == step_id)
    i = s['say'].lower().find(phrase.lower())
    return VO_OFFSET + durs[step_id] * (max(0, i) / len(s['say']))

async def main():
    shutil.rmtree(OUT, ignore_errors=True); os.makedirs(f'{OUT}/frames')
    log = {'cursor': [], 'clicks': [], 'steps': {}, 'frames': []}
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--force-device-scale-factor=2'])
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2)
        t0 = time.time(); T = lambda: time.time() - t0
        await ctx.add_init_script("""localStorage.setItem('charcoal:session', JSON.stringify({access_token:'demo', refresh_token:'demo', expires_at: Date.now()+3600e3, user_id:'demo-user', username:'minitrix'}));
          if (!localStorage.getItem('charcoal:settings')) localStorage.setItem('charcoal:settings', JSON.stringify({v:2, apiKey:'', repliesPerMessage:1, thinking:false, maxSentences:5}));""")
        await ctx.route('**/functions/v1/ai/status', lambda r: r.fulfill(json={'signedIn': True, 'enabled': True, 'usedToday': 300000, 'dailyLimit': 300000}, headers={'Access-Control-Allow-Origin': '*'}))
        await ctx.route('**/rest/v1/**', lambda r: r.fulfill(json=[], headers={'Access-Control-Allow-Origin': '*'}))
        await ctx.route('https://api.deepseek.com/v1/models', lambda r: r.fulfill(json={'object': 'list', 'data': [{'id': 'deepseek-flash'}]}, headers={'Access-Control-Allow-Origin': '*'}))
        await ctx.route('https://api.deepseek.com/v1/chat/completions', lambda r: r.fulfill(body=SSE, headers={'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*'}))
        pg = await ctx.new_page()
        cdp = await ctx.new_cdp_session(pg)
        async def on_frame(ev):
            i = len(log['frames']); log['frames'].append(T())
            open(f'{OUT}/frames/{i:05d}.jpg', 'wb').write(base64.b64decode(ev['data']))
            try: await cdp.send('Page.screencastFrameAck', {'sessionId': ev['sessionId']})
            except Exception: pass
        cdp.on('Page.screencastFrame', lambda ev: asyncio.ensure_future(on_frame(ev)))

        pos = [195.0, 640.0]
        async def move(x, y, dur=0.6):
            x0, y0 = pos; n = max(8, int(dur * 60))
            for i in range(1, n + 1):
                k = i / n; e = 1 - (1 - k) ** 3
                cx, cy = x0 + (x - x0) * e, y0 + (y - y0) * e
                await pg.mouse.move(cx, cy); log['cursor'].append((T(), cx, cy))
                await asyncio.sleep(dur / n)
            pos[0], pos[1] = x, y
        async def center(sel):
            loc = pg.locator(sel).first
            await loc.scroll_into_view_if_needed()
            bb = await loc.bounding_box()
            return bb['x'] + bb['width'] / 2, bb['y'] + bb['height'] / 2
        async def tap(sel, lead=0.6):
            x, y = await center(sel)
            await move(x, y, lead)
            await asyncio.sleep(0.12)
            log['clicks'].append(T())
            await pg.mouse.down(); await asyncio.sleep(0.08); await pg.mouse.up()
        async def until(start, t):  # wait until `t` seconds into the current step
            d = start + t - T()
            if d > 0: await asyncio.sleep(d)

        async def run(step_id, actions):
            start = T()
            await actions(start)
            await until(start, VO_OFFSET + durs[step_id] + PAD)
            log['steps'][step_id] = [start, T()]

        await pg.goto(URL); await pg.wait_for_selector('.limit-banner', timeout=15000)
        await pg.mouse.move(*pos); log['cursor'].append((T(), *pos))
        await cdp.send('Page.startScreencast', {'format': 'jpeg', 'quality': 90})
        await asyncio.sleep(0.5)

        async def a_intro(st):
            await until(st, at('intro', "you might see this") - 0.4)
            x, y = await center('.limit-banner strong'); await move(x - 40, y + 4, 0.9)
            await until(st, at('intro', "plug in your own"))
            x, y = await center('.limit-banner .btn'); await move(x, y, 0.8)
        await run('intro', a_intro)

        async def a_gear(st):
            await until(st, at('gear', 'tap the gear') - 0.5)
            await tap('.topbar .provider-btn')
        await run('gear', a_gear)

        async def a_paste(st):
            await until(st, at('paste', 'your own deepseek key') - 0.3)
            x, y = await center('#ds-key'); await move(x - 60, y - 26, 0.7)  # point at the label
            await until(st, at('paste', 'tap that box') - 0.4)
            await tap('#ds-key')
            await until(st, at('paste', 'paste your key'))
            await pg.keyboard.type('sk-' + ''.join(random.choice('abcdef0123456789') for _ in range(32)), delay=12)
        await run('paste', a_paste)

        async def a_test(st):
            await until(st, at('test', 'tap test connection') - 0.3)
            await tap('.modal-foot .btn-ghost')
        await run('test', a_test)

        async def a_save(st):
            await tap('.modal-foot .btn-primary', 0.5)
        await run('save', a_save)

        async def a_done(st):
            await move(240, 420, 1.0)
        await run('done', a_done)

        async def a_chat(st):
            await until(st, at('chat', 'pick anyone') - 0.2)
            await tap('.tile-grid .tile:has(.tile-name:text-is("Rhett Ashby")) .tile-main', 0.7)  # matches the scripted reply
            await asyncio.sleep(0.8)
            await tap('textarea', 0.5)
            await pg.keyboard.type('hey, the usual?', delay=55)
            await tap('.composer button[aria-label="Send"]', 0.4)
            await pg.wait_for_selector('.msg-char:last-of-type .bubble', timeout=5000)
            # let the reply finish typing out (57 chars/s)
            await asyncio.sleep(len(REPLY_TEXT) / 57 + 0.8)
        await run('chat', a_chat)

        await cdp.send('Page.stopScreencast'); await asyncio.sleep(0.3)
        json.dump(log, open(f'{OUT}/log.json', 'w'))
        print('frames', len(log['frames']), {k: round(v[1] - v[0], 1) for k, v in log['steps'].items()})
        await b.close()
asyncio.run(main())
