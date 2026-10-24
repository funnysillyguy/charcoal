# Gauge drains live while replies stream (mock server :8787); tapping it shows tokens left until a break.
import asyncio
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width':1100,'height':860}); errs=[]
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:4175/')
        await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/v1', repliesPerMessage:3}))""")
        await pg.reload(); await pg.wait_for_timeout(600)
        await pg.click('.tile-grid .tile-main >> nth=0'); await pg.wait_for_timeout(400)
        sx = lambda: pg.evaluate("(() => { const m = getComputedStyle(document.querySelector('.fuel-level')).transform; return m === 'none' ? 1 : +m.split('(')[1].split(',')[0]; })()")
        print('before', round(await sx(), 3))
        await pg.fill('textarea', 'hey'); await pg.keyboard.press('Enter')
        vals = []
        for i in range(8):
            await pg.wait_for_timeout(120); vals.append(round(await sx(), 3))
        print('while streaming', vals)
        await pg.wait_for_timeout(1500)
        await pg.click('.fuel-gauge'); await pg.wait_for_timeout(250)
        print(await pg.inner_text('.fuel-pop'))
        await pg.screenshot(path='/tmp/fuel.png', clip={'x':640,'y':0,'width':460,'height':240})
        print('errors', errs[:3]); await b.close()
asyncio.run(main())
