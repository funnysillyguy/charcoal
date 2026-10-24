import sys, asyncio
from playwright.async_api import async_playwright
html, outdir = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('desktop', {'width': 1366, 'height': 860}), ('mobile', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp)
            errs = []
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('file://' + html)
            await pg.wait_for_timeout(800)
            await pg.click('.foryou-main >> nth=0')
            await pg.wait_for_timeout(400)
            await pg.fill('.composer-input', 'Hello! What is this place? *looks around at the shelves*')
            await pg.keyboard.press('Enter')
            await pg.wait_for_timeout(700)
            await pg.screenshot(path=f'{outdir}/chat-{name}-streaming.png')
            await pg.wait_for_timeout(4500)
            count = await pg.text_content('.swipe-count')
            await pg.click('.swipe button[aria-label="Next response"]')
            await pg.wait_for_timeout(300)
            count2 = await pg.text_content('.swipe-count')
            await pg.screenshot(path=f'{outdir}/chat-{name}.png')
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            print(name, 'swipe', count, '->', count2, 'scrollWidth', sw, 'errors', errs[:5])
        await b.close()
asyncio.run(main())
