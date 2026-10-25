# Render what a friend sees when the server says they've hit the daily limit (response faked via route).
import asyncio, json, sys
from playwright.async_api import async_playwright
OUT = sys.argv[1]
BODY = json.dumps({"error": {"message": "You've hit today's limit on the built-in AI. It resets at midnight UTC, or add your own key in Settings.", "type": "rate_limit"}})
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        for name, vp in [('desktop', {'width': 1100, 'height': 760}), ('mobile', {'width': 390, 'height': 844})]:
            pg = await b.new_page(viewport=vp)
            await pg.route('**/chat/completions', lambda r: r.fulfill(status=429, body=BODY, headers={'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'}))
            await pg.goto('http://localhost:4175/')
            await pg.evaluate("""localStorage.setItem('charcoal:settings', JSON.stringify({v:2, apiKey:'sk-test', model:'deepseek-flash', baseUrl:'http://localhost:8787/functions/v1/ai', repliesPerMessage:1}))""")
            await pg.reload(); await pg.wait_for_timeout(600)
            await pg.click('.tile-grid .tile-main >> nth=1'); await pg.wait_for_timeout(300)
            await pg.fill('textarea', 'hey'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(1500)
            await pg.locator('.msg-char').last.screenshot(path=f'{OUT}-{name}.png')
        await b.close()
asyncio.run(main())
