# Home banner + guide modal (faked: signed in, daily limit reached).
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('d', {'width': 1280, 'height': 860}), ('m', {'width': 390, 'height': 844})]:
            ctx = await b.new_context(viewport=vp)
            await ctx.add_init_script("""localStorage.setItem('charcoal:session', JSON.stringify({access_token:'demo', refresh_token:'demo', expires_at: Date.now()+3600e3, user_id:'demo', username:'minitrix'}));""")
            await ctx.route('**/functions/v1/ai/status', lambda r: r.fulfill(json={'signedIn': True, 'enabled': True, 'usedToday': 300000, 'dailyLimit': 300000}, headers={'Access-Control-Allow-Origin': '*'}))
            await ctx.route('**/rest/v1/**', lambda r: r.fulfill(json=[], headers={'Access-Control-Allow-Origin': '*'}))
            pg = await ctx.new_page(); errs = []; pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:4175/'); await pg.wait_for_selector('.limit-banner', timeout=10000); await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'/tmp/guide/banner-{name}.png')
            await pg.click('.limit-banner .btn'); await pg.wait_for_timeout(2500)
            playing = await pg.evaluate("(() => { const v = document.querySelector('.guide-video'); return v && !v.paused && v.readyState >= 2 ? v.videoWidth + 'x' + v.videoHeight + ' t=' + v.currentTime.toFixed(1) : 'not playing ' + (v && v.error && v.error.code) })()")
            await pg.screenshot(path=f'/tmp/guide/modal-{name}.png')
            print(name, 'video:', playing, 'errors', errs[:2]); await ctx.close()
        await b.close()
asyncio.run(main())
