# E2E: signup -> codes -> create character -> lands in cloud -> fresh browser signs in -> character + key sync down
import asyncio, os, random, json, urllib.request
from playwright.async_api import async_playwright

URL = 'http://localhost:4173/'
USER = f"e2e{random.randint(100000, 999999)}"
PW = 'correct-horse-battery'
KEY = 'sk-test-' + ''.join(random.choice('abcdef0123456789') for _ in range(32))
PROXY = os.environ.get('HTTPS_PROXY')

async def ctx(b, w=1280, h=860):
    c = await b.new_context(viewport={'width': w, 'height': h}, ignore_https_errors=True)
    pg = await c.new_page()
    errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.on('console', lambda m: m.type == 'error' and errs.append(m.text))
    return c, pg, errs

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(proxy={'server': PROXY, 'bypass': 'localhost,127.0.0.1'} if PROXY else None)
        # ---- device A: sign up
        c1, a, ea = await ctx(b)
        await a.goto(URL); await a.wait_for_selector('.sidebar')
        await a.click('.sidebar button:has-text("Sign in")')
        await a.click('button[role=tab]:has-text("Create account")')
        await a.fill('#acct-user', USER)
        await a.fill('#acct-pass', PW); await a.fill('#acct-pass2', PW)
        await a.click('form.account-form button[type=submit]')
        await a.wait_for_selector('.codes-grid li', timeout=30000)
        codes = await a.eval_on_selector_all('.codes-grid code', 'els => els.map(e => e.textContent)')
        print('codes', len(codes), codes[0])
        await a.screenshot(path='/tmp/acct-codes.png')
        assert await a.is_disabled('.codes-panel .btn-primary')
        await a.check('.codes-panel input[type=checkbox]')
        await a.click('.codes-panel .btn-primary')
        # set an API key in Settings
        await a.click('.sidebar button:has-text("Settings")')
        await a.fill('#ds-key', KEY)
        await a.click('.modal-foot .btn-primary')
        await a.wait_for_timeout(400)
        if await a.is_visible('.modal'): await a.keyboard.press('Escape')
        # create a character
        await a.click('.sidebar .create-pill')
        await a.fill('#c-name', 'Sync Fox')
        await a.fill('#c-greeting-0', '*The fox waves.* Hey {{user}}.')
        await a.click('button:has-text("Create character")')
        await a.wait_for_timeout(5000)  # debounce + push
        await a.click(f'.sidebar button:has-text("@{USER}")')
        await a.wait_for_selector('.account-sync:has-text("Synced")', timeout=15000)
        await a.screenshot(path='/tmp/acct-signedin.png')
        print('A sync:', await a.inner_text('.account-sync'))

        # ---- device B: fresh browser, sign in
        c2, bpg, eb = await ctx(b, 390, 844)
        await bpg.goto(URL); await bpg.wait_for_timeout(800)
        # mobile: open drawer
        menu = bpg.locator('button[aria-label="Open menu"]')
        if await menu.count(): await menu.first.click()
        await bpg.click('.sidebar button:has-text("Sign in")')
        await bpg.fill('#acct-user', USER); await bpg.fill('#acct-pass', PW)
        await bpg.click('form.account-form button[type=submit]')
        await bpg.wait_for_selector('.account-card', timeout=30000)
        await bpg.wait_for_timeout(4500)
        await bpg.screenshot(path='/tmp/acct-mobile.png')
        await bpg.keyboard.press('Escape')
        html = await bpg.content()
        print('B sees Sync Fox:', 'Sync Fox' in html)
        stored = await bpg.evaluate("JSON.parse(localStorage.getItem('charcoal:settings')||'{}').apiKey")
        print('B key matches:', stored == KEY)

        # ---- reset with a recovery code on B after signing out
        if await menu.count(): await menu.first.click()
        await bpg.click(f'.sidebar button:has-text("@{USER}")')
        await bpg.click('.account-row button:has-text("Sign out")')
        await bpg.wait_for_timeout(500)
        if await menu.count(): await menu.first.click()
        await bpg.click('.sidebar button:has-text("Sign in")')
        await bpg.click('button:has-text("Forgot password?")')
        await bpg.fill('#acct-user', USER); await bpg.fill('#acct-code', codes[3].lower()); await bpg.fill('#acct-pass', 'brand-new-pass-1')
        await bpg.click('form.account-form button[type=submit]')
        await bpg.wait_for_selector('.account-card', timeout=30000)
        print('reset ok, toast:', await bpg.inner_text('.toast-stack') if await bpg.locator('.toast-stack').count() else '')

        # check cloud row is ciphertext only
        print('errors A:', ea[:5]); print('errors B:', eb[:5])
        # cleanup: delete account
        await bpg.click('.account-row.danger button')
        await bpg.click('.modal-foot .btn-danger')
        await bpg.wait_for_timeout(2500)
        print('deleted; signed out:', await bpg.evaluate("localStorage.getItem('charcoal:session')") is None)
        await b.close()

asyncio.run(main())
