import sys, asyncio
from playwright.async_api import async_playwright
html, outdir = sys.argv[1], sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('desktop', {'width': 1366, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
            await pg.goto('file://' + html)
            await pg.wait_for_timeout(700)
            # chat once so the sidebar has a row
            await pg.click('.foryou-main >> nth=1')
            await pg.wait_for_timeout(300)
            if name == 'mobile':
                await pg.click('.chat-head .nav-menu')
                await pg.wait_for_timeout(400)
                await pg.screenshot(path=f'{outdir}/sidebar-{name}.png')
                await pg.click('.sidebar .create-pill')
            else:
                await pg.screenshot(path=f'{outdir}/sidebar-{name}.png')
                await pg.click('.sidebar .create-pill')
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{outdir}/creator-{name}.png')
            # Help me write offline draft + apply + create
            await pg.fill('#helper-idea', 'a shy wolf librarian who loves thunderstorms')
            await pg.click('button:has-text("Draft it")')
            await pg.wait_for_timeout(400)
            await pg.click('button:has-text("Use this draft")')
            await pg.wait_for_timeout(300)
            await pg.click('button:has-text("Add a greeting")')
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            await pg.click('.creator-foot .btn-primary')
            await pg.wait_for_timeout(500)
            title = await pg.text_content('.chat-name')
            print(name, 'created ->', title, 'scrollWidth', sw, 'errors', errs[:4])
        await b.close()
asyncio.run(main())
