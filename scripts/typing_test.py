# Typewriter pace check: the server sends the whole reply at once; on screen it should type at ~57 chars/s.
import asyncio, json
from playwright.async_api import async_playwright
TEXT = ('*Finn beams, his blue eyes shining as he sees you take the plushie. He seems relieved, his tail thumping softly '
        'against the back of his leg despite his embarrassment.* "R-Really?! You\'ll take it?!" *He lets out a happy little chirp, '
        'fidgeting with the hem of his pink sweater.* "I almost bought two... just in case you didn\'t want it, but I\'m s-so glad you do!"')
SSE = ''.join(f"data: {json.dumps(c)}\n\n" for c in [{"choices": [{"delta": {"content": TEXT}}]}, {"choices": [{"delta": {}, "finish_reason": "stop"}]}]) + 'data: [DONE]\n\n'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 390, 'height': 844}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/chat/completions', lambda r: r.fulfill(body=SSE, headers={'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*'}))
        await pg.goto('http://localhost:4175/')
        await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({v:2, apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/v1', repliesPerMessage:1, thinking:false}))""")
        await pg.reload(); await pg.wait_for_timeout(600)
        await pg.click('.tile-grid .tile-main >> nth=1'); await pg.wait_for_timeout(400)
        await pg.fill('textarea', 'ooo sure'); await pg.keyboard.press('Enter')
        samples = []
        t0 = None
        for i in range(60):
            n = await pg.evaluate("(document.querySelector('.msg-char:last-of-type .bubble')?.innerText || '').length")
            t = await pg.evaluate('performance.now()')
            if n > 0 and t0 is None: t0 = (t, n)
            if t0: samples.append(((t - t0[0]) / 1000, n))
            await pg.wait_for_timeout(250)
            if t0 and samples[-1][1] >= len(TEXT) - 12 and len(samples) > 3: break
        rates = [round((b_[1] - a[1]) / (b_[0] - a[0])) for a, b_ in zip(samples, samples[1:]) if b_[0] > a[0] and b_[1] < len(TEXT) - 12]
        total = samples[-1][0]
        print('chars', len(TEXT), '| typed in', round(total, 1), 's | per-step chars/s:', rates[:14])
        print('avg', round((samples[-1][1] - samples[0][1]) / max(0.01, total)), 'chars/s | errors', errs[:2])
        await b.close()
asyncio.run(main())
