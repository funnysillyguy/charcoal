import asyncio, sys
from playwright.async_api import async_playwright
M = sys.argv[1]; out = sys.argv[2]
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('desktop', {'width': 1280, 'height': 900}), ('mobile', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp)
            errs = []
            pg.on('pageerror', lambda e: errs.append(str(e)))
            await pg.goto('http://localhost:4173/')
            await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/v1'}))""")
            await pg.reload(); await pg.wait_for_timeout(600)
            if name == 'mobile':
                await pg.click('.topbar .nav-create')
            else:
                await pg.click('.sidebar .create-pill')
            await pg.wait_for_timeout(300)
            await pg.click('button[aria-label="Port from screenshots"]')
            await pg.set_input_files('.port-slot:nth-child(1) input[type=file]', f'{M}/profile.png')
            await pg.set_input_files('.port-slot:nth-child(2) input[type=file]', f'{M}/greeting.png')
            await pg.wait_for_timeout(400)
            await pg.click('button:has-text("Read screenshots")')
            await pg.wait_for_selector('.port-crop .port-stage', timeout=5000)
            await pg.wait_for_timeout(400)
            await pg.screenshot(path=f'{out}/port-{name}.png', full_page=False)
            sw = await pg.evaluate('document.documentElement.scrollWidth')
            await pg.click('button:has-text("Use this")')
            await pg.wait_for_timeout(500)
            nm = await pg.input_value('#c-name'); cr = await pg.input_value('#c-creator')
            g = await pg.input_value('#c-greeting-0')
            av = await pg.evaluate("document.querySelector('.cavatar .avatar img')?.src?.slice(0,23)")
            print(name, '| name:', nm, '| creator:', cr, '| greeting:', g[:30], '| avatar:', av, '| scrollW', sw, '| errors', errs[:3])
        await b.close()
asyncio.run(main())
