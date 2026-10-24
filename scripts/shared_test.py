# A friend with no key: sign up, chat, and the reply streams through Charcoal's built-in AI (server proxy).
import asyncio, os, random, json
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        P = os.environ.get('HTTPS_PROXY')
        b = await p.chromium.launch(proxy={'server': P, 'bypass': 'localhost,127.0.0.1'} if P else None)
        c = await b.new_context(viewport={'width': 1200, 'height': 860}, ignore_https_errors=True); pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        bodies = []
        pg.on('request', lambda r: bodies.append(r.post_data) if '/functions/v1/ai/chat' in r.url else None)
        await pg.goto('http://localhost:4175/'); await pg.wait_for_selector('.sidebar')
        s = await pg.evaluate("JSON.parse(localStorage.getItem('charcoal:settings')||'null')")
        await pg.click('.tile-grid .tile-main >> nth=1'); await pg.wait_for_timeout(400)
        print('signed-out note:', (await pg.inner_text('.composer-note')).strip())
        u = f"friend{random.randint(10000,99999)}"
        await pg.click('.composer-note-btn'); await pg.click('button[role=tab]:has-text("Create account")')
        await pg.fill('#acct-user', u); await pg.fill('#acct-pass', 'pass-pass-1'); await pg.fill('#acct-pass2', 'pass-pass-1')
        await pg.click('form.account-form button[type=submit]'); await pg.wait_for_selector('.codes-grid li', timeout=30000)
        await pg.check('.codes-panel input[type=checkbox]'); await pg.click('.codes-panel .btn-primary'); await pg.wait_for_timeout(1500)
        print('note after sign-in:', await pg.locator('.composer-note').count())
        await pg.fill('textarea', 'hey'); await pg.keyboard.press('Enter'); await pg.wait_for_timeout(5000)
        last = pg.locator('.msg-char').last
        print('reply:', (await last.locator('.bubble').inner_text())[:90])
        print('swipe count:', (await last.locator('.swipe-count').inner_text()).strip())
        body = json.loads(bodies[0]) if bodies else {}
        print('requests:', len(bodies), '| thinking:', body.get('thinking'), '| effort:', body.get('reasoning_effort'), '| key sent? ', 'sk-' in (bodies[0] or ''))
        sysmsg = body.get('messages', [{}])[0].get('content', '')
        print('5-sentence rule in prompt:', '5 sentences or fewer' in sysmsg)
        await pg.click('.sidebar button:has-text("Settings")'); await pg.wait_for_timeout(1200)
        print('settings card:', (await pg.inner_text('.builtin-card')).replace('\n', ' | ')[:160])
        await pg.screenshot(path='/tmp/settings-friend.png')
        await pg.keyboard.press('Escape')
        await pg.click(f'.sidebar button:has-text("@{u}")'); await pg.click('.account-row.danger button'); await pg.click('.modal-foot .btn-danger'); await pg.wait_for_timeout(2000)
        print('errors', errs[:3]); await b.close()
asyncio.run(main())
