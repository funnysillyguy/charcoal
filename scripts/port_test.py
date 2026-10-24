# Port flow with real screenshots against the mock DeepSeek server (scratchpad/mock/server.mjs on :8787)
import asyncio, sys
from playwright.async_api import async_playwright
SHOTS = sys.argv[1:4]; OUT = '/tmp'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('desktop', {'width': 1280, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp); errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:4175/')
            await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/v1'}))""")
            await pg.reload(); await pg.wait_for_timeout(600)
            if name == 'mobile': await pg.click('.topbar .nav-create')
            else: await pg.click('.sidebar .create-pill')
            await pg.click('button[aria-label="Port from screenshots"]')
            await pg.set_input_files('.port-drop input[type=file]', SHOTS)
            await pg.wait_for_selector('.port-thumb >> nth=2')
            await pg.click('button:has-text("Read screenshots")')
            await pg.wait_for_selector('.port-crop .port-stage', timeout=8000); await pg.wait_for_timeout(500)
            snapped = await pg.locator('.snap-chip').count()
            bold = await pg.locator('.port-greeting strong').count()
            await pg.locator('.port').screenshot(path=f'{OUT}/port-{name}.png')
            await pg.click('.port-version button:has-text("Original")'); orig = await pg.inner_text('.port-desc')
            await pg.click('.port-version button:has-text("Improved")'); imp = await pg.inner_text('.port-desc')
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            await pg.click('button:has-text("Use this")'); await pg.wait_for_timeout(500)
            nm = await pg.input_value('#c-name'); g = await pg.input_value('#c-greeting-0'); d = await pg.input_value('#c-desc')
            av = await pg.evaluate("document.querySelector('.cavatar img, .avatar img')?.src?.slice(0,23)")
            print(name, '| snapped:', snapped, '| bold spans:', bold, '| name:', nm, '| desc lines:', d.count('\n')+1, '| greeting has **:', '**' in g, '| avatar:', av, '| scrollW', sw, '| errors', errs[:3])
            print('   original:', orig[:50].replace('\n','/'), '| improved:', imp[:50].replace('\n','/'))
        await b.close()
asyncio.run(main())
