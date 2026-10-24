import asyncio, os, random
from playwright.async_api import async_playwright
async def main():
    async with async_playwright() as p:
        P=os.environ.get('HTTPS_PROXY')
        b = await p.chromium.launch(proxy={'server':P,'bypass':'localhost,127.0.0.1'})
        for w,h in ((1280,860),(390,844)):
            c = await b.new_context(viewport={'width':w,'height':h}, ignore_https_errors=True); a = await c.new_page()
            await a.goto('http://localhost:4174/'); await a.wait_for_timeout(600)
            m=a.locator('button[aria-label="Open menu"]')
            if w<500 and await m.count(): await m.first.click()
            await a.click('.sidebar button:has-text("Sign in")'); await a.click('button[role=tab]:has-text("Create account")')
            u=f"shot{random.randint(10000,99999)}"
            await a.fill('#acct-user',u); await a.fill('#acct-pass','pass-pass-1'); await a.fill('#acct-pass2','pass-pass-1')
            await a.click('form.account-form button[type=submit]'); await a.wait_for_selector('.codes-grid li'); await a.wait_for_timeout(700)
            await a.screenshot(path=f'/tmp/codes-{w}.png')
            await a.check('.codes-panel input[type=checkbox]'); await a.click('.codes-panel .btn-primary')
            if w<500 and await m.count(): await m.first.click()
            await a.click(f'.sidebar button:has-text("@{u}")'); await a.click('.account-row.danger button'); await a.click('.modal-foot .btn-danger'); await a.wait_for_timeout(2000)
        await b.close()
asyncio.run(main())
