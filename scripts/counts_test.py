# Real chat counts: everything "New" at first; after one account chats with a character, it shows 1.
import asyncio, os, random, json
from playwright.async_api import async_playwright
SSE = ''.join(f"data: {json.dumps(c)}\n\n" for c in [{"choices": [{"delta": {"content": "*waves* Hey."}}]}, {"choices": [{"delta": {}, "finish_reason": "stop"}]}]) + 'data: [DONE]\n\n'
async def main():
    async with async_playwright() as p:
        P = os.environ.get('HTTPS_PROXY')
        b = await p.chromium.launch(proxy={'server': P, 'bypass': 'localhost,127.0.0.1'} if P else None)
        c = await b.new_context(viewport={'width': 1200, 'height': 820}, ignore_https_errors=True); pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**/functions/v1/ai/chat/completions', lambda r: r.fulfill(body=SSE, headers={'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': '*'}))
        await pg.goto('http://localhost:4175/'); await pg.wait_for_selector('.tile-grid .tile-stat'); await pg.wait_for_timeout(1500)
        stats = await pg.eval_on_selector_all('.tile-grid .tile-stat', 'els => els.map(e => e.innerText)')
        print('signed out:', sorted(set(stats)), '| hero:', await pg.inner_text('.hero-meta'))
        u = f"count{random.randint(10000,99999)}"
        await pg.click('.sidebar button:has-text("Sign in")'); await pg.click('button[role=tab]:has-text("Create account")')
        await pg.fill('#acct-user', u); await pg.fill('#acct-pass', 'pass-pass-1'); await pg.fill('#acct-pass2', 'pass-pass-1')
        await pg.click('form.account-form button[type=submit]'); await pg.wait_for_selector('.codes-grid li', timeout=30000)
        await pg.check('.codes-panel input[type=checkbox]'); await pg.click('.codes-panel .btn-primary'); await pg.wait_for_timeout(800)
        name = await pg.inner_text('.tile-grid .tile >> nth=1 >> .tile-name')
        await pg.click('.tile-grid .tile-main >> nth=1'); await pg.wait_for_timeout(400)
        await pg.fill('textarea', 'hi'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(2500)
        await pg.click('.sidebar button:has-text("Discover")'); await pg.wait_for_timeout(1500)
        tiles = await pg.eval_on_selector_all('.tile-grid .tile', 'els => els.map(e => [e.querySelector(".tile-name").innerText, e.querySelector(".tile-stat").innerText])')
        print('after chatting with', name, '->', [t for t in tiles if t[0] == name])
        await pg.click(f'.tile-grid .tile:has-text("{name}") .tile-info'); await pg.wait_for_timeout(600)
        print('profile shows:', 'chat' in (await pg.inner_text('.modal')).lower(), '| errors', errs[:3])
        await pg.keyboard.press('Escape')
        await pg.click(f'.sidebar button:has-text("@{u}")'); await pg.click('.account-row.danger button'); await pg.click('.modal-foot .btn-danger'); await pg.wait_for_timeout(2000)
        await b.close()
asyncio.run(main())
