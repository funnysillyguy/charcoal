# Link-preview card (og.png, 1200x630) and app icons, made from the real character art in the app.
import asyncio, base64, os
from playwright.async_api import async_playwright
OUT = '/home/claude/charcoal/public'
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        pg = await b.new_page(viewport={'width': 1366, 'height': 900}, device_scale_factor=2)
        await pg.goto('http://localhost:4175/'); await pg.wait_for_selector('.tile-grid .tile-art'); await pg.wait_for_timeout(1200)
        imgs = []
        for name in ['Rhett Ashby', 'Sable Northwind', 'Pemba', 'Seraphine Vale']:  # picked by name, not position
            art = pg.locator(f'.tile-grid .tile:has(.tile-name:text-is("{name}")) .tile-art').first
            if await art.count():
                png = await art.screenshot()
                imgs.append('data:image/png;base64,' + base64.b64encode(png).decode())
        tiles = ''.join(f'<div class="t" style="--r:{r}deg;--y:{y}px"><img src="{src}"></div>' for src, r, y in zip(imgs[:4], [-6, 3, -2, 5], [30, -10, 20, -24]))
        html = f"""<html><head><style>
        body{{margin:0;width:1200px;height:630px;background:#18181b;font-family:'Inter',sans-serif;color:#fafafa;overflow:hidden;position:relative}}
        .left{{position:absolute;left:84px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;gap:26px;width:500px}}
        .brand{{display:flex;align-items:center;gap:20px}}
        .mark{{position:relative;width:86px;height:86px;border-radius:26px;background:#27272a;box-shadow:inset 0 0 0 2px #34343b;overflow:hidden}}
        .mark::after{{content:'';position:absolute;left:16px;right:12px;top:50%;height:11px;border-radius:11px;transform:rotate(-18deg);background:#f2a25c}}
        .word{{font-size:76px;font-weight:700;letter-spacing:-.045em}}
        .tag{{font-size:38px;font-weight:600;letter-spacing:-.025em;line-height:1.15;color:#fafafa}}
        .sub{{font-size:24px;color:#a2a2ac;line-height:1.4}}
        .grid{{position:absolute;right:56px;top:50%;transform:translateY(-50%);display:grid;grid-template-columns:repeat(2,232px);gap:22px}}
        .t{{width:232px;height:262px;border-radius:30px;overflow:hidden;transform:rotate(var(--r)) translateY(var(--y));box-shadow:0 0 0 2px rgba(255,255,255,.06)}}
        .t img{{width:100%;height:100%;object-fit:cover}}
        </style></head><body>
        <div class="left"><div class="brand"><div class="mark"></div><div class="word">charcoal</div></div>
        <div class="tag">Chat with characters.<br>Make your own.</div>
        <div class="sub">Free AI roleplay. Swipe replies, build characters, bring yours over from other apps.</div></div>
        <div class="grid">{tiles}</div></body></html>"""
        og = await b.new_page(viewport={'width': 1200, 'height': 630}, device_scale_factor=1)
        await og.set_content(html); await og.wait_for_timeout(400)
        await og.screenshot(path=f'{OUT}/og.png')
        icon = await b.new_page(viewport={'width': 512, 'height': 512})
        await icon.set_content("""<html><body style="margin:0;width:512px;height:512px;background:#27272a;position:relative;overflow:hidden">
          <div style="position:absolute;left:96px;right:76px;top:50%;height:58px;margin-top:-29px;border-radius:58px;transform:rotate(-18deg);background:#f2a25c"></div></body></html>""")
        await icon.screenshot(path='/tmp/og/icon512.png')
        await b.close()
asyncio.run(main())
