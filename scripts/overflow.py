import sys, asyncio
from playwright.async_api import async_playwright
html = sys.argv[1]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 390, 'height': 844})
        await pg.goto('file://' + html)
        await pg.wait_for_timeout(700)
        await pg.click('.foryou-main >> nth=0')
        await pg.wait_for_timeout(500)
        res = await pg.evaluate('''() => [...document.querySelectorAll('*')].filter(e => e.getBoundingClientRect().right > 391).slice(0,12).map(e => e.className + ' ' + Math.round(e.getBoundingClientRect().right) + ' w' + Math.round(e.getBoundingClientRect().width))''')
        print('\n'.join(map(str,res)))
        await b.close()
asyncio.run(main())
