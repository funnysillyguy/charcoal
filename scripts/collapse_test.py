import sys, asyncio
from playwright.async_api import async_playwright
html = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 860})
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('file://' + html)
        await pg.wait_for_timeout(600)
        await pg.click('.sidebar-collapse')
        await pg.wait_for_timeout(200)
        hidden = await pg.evaluate("getComputedStyle(document.querySelector('.sidebar')).display")
        await pg.click('.topbar .nav-menu')
        await pg.wait_for_timeout(200)
        shown = await pg.evaluate("getComputedStyle(document.querySelector('.sidebar')).display")
        await pg.click('.sidebar .create-pill'); await pg.wait_for_timeout(200)
        creator = await pg.locator('.creator').count()
        print('collapsed:', hidden, '-> reopened:', shown, '| creator page:', creator, '| errors', errs[:3])
        await b.close()
asyncio.run(main())
