# Thanks flow in the browser: friend thanks the sponsor (animated + top banner), sponsor sees the badge + inbox.
import asyncio, os, json
from playwright.async_api import async_playwright
U='https://pknqtfkdlpkhzyrysnft.supabase.co'; K='sb_publishable_tBfe7UFz0OEgOpePYVtmOQ_IQGpfIIU'
async def login(pg, user):
    await pg.goto('http://localhost:4175/'); await pg.wait_for_selector('.sidebar')
    await pg.click('.sidebar button:has-text("Sign in")'); await pg.fill('#acct-user', user); await pg.fill('#acct-pass', 'pass-pass-1')
    await pg.click('form.account-form button[type=submit]'); await pg.wait_for_selector('.account-card', timeout=30000)
    await pg.keyboard.press('Escape'); await pg.wait_for_timeout(1200)
async def main():
    async with async_playwright() as p:
        P = os.environ.get('HTTPS_PROXY')
        b = await p.chromium.launch(proxy={'server': P, 'bypass': 'localhost,127.0.0.1'} if P else None)
        # friend
        c = await b.new_context(viewport={'width': 1200, 'height': 820}, ignore_https_errors=True); pg = await c.new_page(); errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await login(pg, 'friend12594')
        await pg.click('.sidebar button:has-text("Settings")'); await pg.wait_for_selector('.powered-by', timeout=10000)
        print('friend sees:', (await pg.inner_text('.powered-by')).replace('\n', ' | '))
        await pg.click('.thank-btn'); await pg.wait_for_selector('.top-notice', timeout=5000); await pg.wait_for_timeout(450)
        await pg.screenshot(path='/tmp/thanks-sent.png')
        print('top notice:', await pg.inner_text('.top-notice'), '| button now:', await pg.inner_text('.thank-btn'))
        await c.close()
        # sponsor
        c = await b.new_context(viewport={'width': 1200, 'height': 820}, ignore_https_errors=True); pg = await c.new_page()
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await login(pg, 'sponsor7146')
        await pg.wait_for_selector('.notif-badge', timeout=10000)
        print('sponsor badge:', await pg.inner_text('.notif-badge'))
        await pg.locator('.sidebar').screenshot(path='/tmp/badge.png')
        await pg.click('.sidebar button:has-text("Notifications")'); await pg.wait_for_selector('.notif-item', timeout=8000); await pg.wait_for_timeout(300)
        await pg.screenshot(path='/tmp/inbox.png')
        print('inbox:', (await pg.inner_text('.notif-list')).replace('\n', ' | '))
        await pg.wait_for_timeout(1500); await pg.keyboard.press('Escape'); await pg.wait_for_timeout(400)
        print('badge after opening:', await pg.locator('.notif-badge').count())
        print('errors', errs[:3]); await b.close()
asyncio.run(main())
