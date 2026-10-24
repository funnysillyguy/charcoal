# Drag the latest reply left/right (mouse and touch) against the mock server on :8787.
import asyncio
from playwright.async_api import async_playwright
async def count(pg): return (await pg.inner_text('.msg-char:last-of-type .swipe-count')).strip()
async def drag(pg, dx):
    box = await pg.locator('.msg-char').last.locator('.bubble').bounding_box()
    x, y = box['x'] + box['width'] / 2, box['y'] + min(40, box['height'] / 2)
    await pg.mouse.move(x, y); await pg.mouse.down()
    for i in range(1, 11): await pg.mouse.move(x + dx * i / 10, y + 2); await pg.wait_for_timeout(12)
    await pg.mouse.up(); await pg.wait_for_timeout(450)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); pg = await b.new_page(viewport={'width': 1100, 'height': 860}); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://localhost:4175/')
        await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/v1', repliesPerMessage:3}))""")
        await pg.reload(); await pg.wait_for_timeout(700)
        await pg.click('.tile-grid .tile-main >> nth=1'); await pg.wait_for_timeout(400)
        await pg.fill('textarea', 'hey there'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2500)
        print('start', await count(pg))
        await drag(pg, -220); print('left ->', await count(pg))
        await drag(pg, -220); print('left ->', await count(pg))
        await drag(pg, -40);  print('small left (no change) ->', await count(pg))
        await drag(pg, -220); print('left past last ->', await count(pg)); await pg.wait_for_timeout(2200)
        await drag(pg, 220);  print('right ->', await count(pg))
        await drag(pg, 220);  print('right ->', await count(pg))
        # vertical drag should not swipe
        box = await pg.locator('.msg-char').last.locator('.bubble').bounding_box()
        await pg.mouse.move(box['x']+100, box['y']+20); await pg.mouse.down(); await pg.mouse.move(box['x']+110, box['y']+140, steps=8); await pg.mouse.up(); await pg.wait_for_timeout(300)
        print('vertical drag ->', await count(pg))
        # mid-drag screenshot with hint
        box = await pg.locator('.msg-char').last.locator('.bubble').bounding_box(); x, y = box['x']+box['width']/2, box['y']+30
        await pg.mouse.move(x, y); await pg.mouse.down(); await pg.mouse.move(x-130, y, steps=10)
        await pg.screenshot(path='/tmp/swipe-mid.png'); await pg.mouse.up()
        print('errors', errs[:3]); await b.close()
asyncio.run(main())
