import sys, asyncio
from playwright.async_api import async_playwright
html, out = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 900})
        await pg.goto('file://' + html)
        await pg.wait_for_timeout(800)
        await pg.click('button.tab:has-text("Furry")')
        await pg.wait_for_timeout(300)
        el = await pg.query_selector('.grid')
        await el.screenshot(path=out)
        await b.close()
asyncio.run(main())
