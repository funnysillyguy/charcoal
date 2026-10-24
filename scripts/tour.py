# Screenshot the main screens on desktop and phone for a design review.
import asyncio, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1] if len(sys.argv) > 1 else '/tmp/tour'
async def main():
    import os; os.makedirs(OUT, exist_ok=True)
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('d', {'width': 1366, 'height': 900}), ('m', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp, device_scale_factor=1)
            await pg.goto('http://localhost:4175/')
            await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/v1', repliesPerMessage:3}))""")
            await pg.reload(); await pg.wait_for_timeout(900)
            await pg.screenshot(path=f'{OUT}/{name}-home.png')
            await pg.evaluate("document.querySelector('.page-scroll').scrollTop = 620"); await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{OUT}/{name}-home2.png')
            await pg.click('.tile-grid .tile-main >> nth=1'); await pg.wait_for_timeout(500)
            await pg.fill('textarea', 'hey, long day. what do you recommend?'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2500)
            await pg.screenshot(path=f'{OUT}/{name}-chat.png')
            if name == 'm': await pg.click('.topbar .nav-create, .chat-head button[aria-label="Open menu"]', timeout=3000) if False else None
            await pg.goto('http://localhost:4175/'); await pg.wait_for_timeout(600)
            if name == 'd': await pg.click('.sidebar .create-pill')
            else: await pg.click('.topbar .nav-create')
            await pg.wait_for_timeout(500)
            await pg.screenshot(path=f'{OUT}/{name}-create.png')
        await b.close()
asyncio.run(main())
