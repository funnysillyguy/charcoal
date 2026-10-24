# Usage: python3 scripts/shot.py <html> <outdir> [actions...]
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
            await pg.wait_for_timeout(1200)
            await pg.screenshot(path=f'{outdir}/{name}.png')
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            print(name, 'scrollWidth', sw, 'errors', errs[:5])
        await b.close()
asyncio.run(main())
