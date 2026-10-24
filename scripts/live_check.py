import asyncio, os, random
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        P=os.environ.get('HTTPS_PROXY')
        b = await p.chromium.launch(proxy={'server':P} if P else None)
        c = await b.new_context(viewport={'width':1280,'height':860}, ignore_https_errors=True); a = await c.new_page()
        errs=[]; a.on('pageerror', lambda e: errs.append(str(e)))
        await a.goto('https://funnysillyguy.github.io/charcoal/', wait_until='networkidle'); await a.wait_for_selector('.sidebar')
        u=f"live{random.randint(10000,99999)}"
        await a.click('.sidebar button:has-text("Sign in")'); await a.click('button[role=tab]:has-text("Create account")')
        await a.fill('#acct-user',u); await a.fill('#acct-pass','pass-pass-1'); await a.fill('#acct-pass2','pass-pass-1')
        await a.click('form.account-form button[type=submit]'); await a.wait_for_selector('.codes-grid li', timeout=30000)
        await a.check('.codes-panel input[type=checkbox]'); await a.click('.codes-panel .btn-primary')
        await a.click(f'.sidebar button:has-text("@{u}")'); await a.wait_for_selector('.account-sync:has-text("Synced")', timeout=15000)
        print('live account flow ok:', await a.inner_text('.account-sync'))
        await a.click('.account-row.danger button'); await a.click('.modal-foot .btn-danger'); await a.wait_for_timeout(2000)
        await a.screenshot(path='/tmp/live.png'); print('errors:', errs[:3])
        await b.close()
asyncio.run(main())
