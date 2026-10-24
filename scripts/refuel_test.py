import sys, asyncio
from playwright.async_api import async_playwright
html, out = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 390, 'height': 844})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + html)
        await pg.evaluate("localStorage.setItem('charcoal:fuel', JSON.stringify({used: 1999990, capacity: 2000000, refuelStartedAt: null}))")
        await pg.reload()
        await pg.wait_for_timeout(700)
        await pg.click('.foryou-main >> nth=0')
        await pg.fill('.composer-input', 'hi')
        await pg.keyboard.press('Enter')
        await pg.wait_for_timeout(3500)
        await pg.evaluate("(() => { const s = JSON.parse(localStorage.getItem('charcoal:fuel')); s.refuelStartedAt = Date.now() - 27000; localStorage.setItem('charcoal:fuel', JSON.stringify(s)); })()")
        await pg.reload()
        await pg.wait_for_timeout(900)
        visible = await pg.locator('.refuel').count()
        await pg.screenshot(path=out)
        print('overlay visible:', visible, 'text:', (await pg.text_content('.refuel-text p')) if visible else None, 'errors', errs[:3])
        await b.close()
asyncio.run(main())
