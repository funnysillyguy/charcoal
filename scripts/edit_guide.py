# Zoom-follow edit for the walkthrough: the camera tracks the tap cursor, pushes in on taps,
# and step captions sit at the bottom. Output: public/guide-own-key.mp4 (H.264, 720x1280).
import json, subprocess, sys, math
import cv2, numpy as np
from PIL import Image, ImageDraw, ImageFont

LOG = json.load(open('/tmp/guide/log.json'))
FRAMES = LOG['frames']  # screencast timestamps (seconds from our clock start), one jpg each
OUT_W, OUT_H = 720, 1280
DSF = 2
LEAD = 0.0  # screencast frames share our clock
FONT = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 30)

fps = 30
first = cv2.imread('/tmp/guide/frames/00000.jpg')
SH, SW = first.shape[:2]
DSF = SW / 390
print('source frame', SW, SH)
_cache = {}
def frame_at(t):
    i = max(0, int(np.searchsorted(np.array(FRAMES), t, side='right')) - 1)
    if i not in _cache:
        _cache.clear(); _cache[i] = cv2.imread(f'/tmp/guide/frames/{i:05d}.jpg')
    return _cache[i]
aspect = OUT_W / OUT_H
base_w = SW; base_h = base_w / aspect  # zoom 1.0 window (full width)

cur = np.array([(t + LEAD, x * DSF, y * DSF) for t, x, y in LOG['cursor']])
clicks = [t + LEAD for t in LOG['clicks']]
caps = [(t + LEAD, s) for t, s in LOG['captions']]
end = LOG['end'] + LEAD

def cursor_at(t):
    if t <= cur[0, 0]: return cur[0, 1:]
    if t >= cur[-1, 0]: return cur[-1, 1:]
    i = np.searchsorted(cur[:, 0], t)
    a, b = cur[i - 1], cur[i]
    k = (t - a[0]) / max(1e-6, b[0] - a[0])
    return a[1:] + (b[1:] - a[1:]) * k

def draw_cursor(img, t):
    # Tap cursor: soft shadow, translucent fill, white ring; shrinks on press; ripple after each tap.
    x, y = cursor_at(t)
    S = img.shape[1] / 390  # source px per CSS px
    press = 0.0
    for c in clicks:
        d = t - c
        if 0 <= d < 0.18: press = max(press, 1 - abs(d - 0.06) / 0.12)
        if 0 <= d < 0.6:  # ripple
            k = d / 0.6
            r = int((12 + 26 * k) * S)
            ov = img.copy()
            cv2.circle(ov, (int(x), int(y)), r, (255, 255, 255), max(1, int(2 * S)), cv2.LINE_AA)
            cv2.addWeighted(ov, 0.9 * (1 - k), img, 1 - 0.9 * (1 - k), 0, img)
    r = int((17 - 4 * press) * S)
    ov = img.copy()
    cv2.circle(ov, (int(x), int(y + 2 * S)), r + int(3 * S), (0, 0, 0), -1, cv2.LINE_AA)
    cv2.addWeighted(ov, 0.28, img, 0.72, 0, img)
    ov = img.copy()
    cv2.circle(ov, (int(x), int(y)), r, (255, 255, 255), -1, cv2.LINE_AA)
    cv2.addWeighted(ov, 0.28 + 0.3 * press, img, 0.72 - 0.3 * press, 0, img)
    cv2.circle(img, (int(x), int(y)), r, (255, 255, 255), max(2, int(2.5 * S)), cv2.LINE_AA)

def zoom_target(t):
    if t < 1.6 or t > end - 1.3: return 1.0  # establish the whole screen at start and end
    z = 1.3
    for c in clicks:  # push in a little around each tap
        d = t - c
        if -0.45 < d < 0.9: z = max(z, 1.3 + 0.15 * math.exp(-((d - 0.1) ** 2) / 0.12))
    return z

def caption_at(t):
    s = None
    for ct, text in caps:
        if t >= ct: s = text
    return s

def draw_caption(frame_rgb, text, alpha):
    if not text or alpha <= 0: return frame_rgb
    im = Image.fromarray(frame_rgb).convert('RGBA')
    layer = Image.new('RGBA', im.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    tw = d.textlength(text, font=FONT)
    pad_x, h = 26, 64
    w = tw + pad_x * 2
    x0 = (OUT_W - w) / 2; y0 = 54
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=32, fill=(12, 12, 14, int(225 * alpha)), outline=(255, 255, 255, int(40 * alpha)), width=2)
    d.text((x0 + pad_x, y0 + (h - 36) / 2), text, font=FONT, fill=(250, 250, 250, int(255 * alpha)))
    return np.array(Image.alpha_composite(im, layer).convert('RGB'))

tmp = '/tmp/guide/edit.mp4'
vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*'mp4v'), fps, (OUT_W, OUT_H))
cx, cy = SW / 2, SH / 2; z = 1.0
n = 0
last_cap, cap_since = None, 0
start = max(FRAMES[0], caps[0][0] - 0.1)  # skip the blank first paint
while True:
    t = start + n / fps; n += 1
    if t > end + 0.4: break
    frame = frame_at(t).copy()
    draw_cursor(frame, t)
    tx, ty = cursor_at(t)
    zt = zoom_target(t)
    # critically-damped-ish smoothing so the camera glides instead of jerking
    a_pos = 1 - math.exp(-1 / fps / 0.22)
    a_z = 1 - math.exp(-1 / fps / 0.35)
    cx += (tx - cx) * a_pos; cy += (ty - cy) * a_pos; z += (zt - z) * a_z
    w, h = base_w / z, base_h / z
    x0 = min(max(cx - w / 2, 0), SW - w); y0 = min(max(cy - h / 2, 0), SH - h)
    crop = frame[int(y0):int(y0 + h), int(x0):int(x0 + w)]
    out = cv2.resize(crop, (OUT_W, OUT_H), interpolation=cv2.INTER_AREA if z < 1.2 else cv2.INTER_CUBIC)
    text = caption_at(t)
    if text != last_cap: last_cap, cap_since = text, t
    alpha = min(1, (t - cap_since) / 0.25)
    rgb = cv2.cvtColor(out, cv2.COLOR_BGR2RGB)
    rgb = draw_caption(rgb, text, alpha)
    vw.write(cv2.cvtColor(rgb, cv2.COLOR_RGB2BGR))
vw.release()
dst = '/home/claude/charcoal/public/guide-own-key.mp4'
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-c:v', 'libx264', '-preset', 'slow', '-crf', '29', '-pix_fmt', 'yuv420p',
                '-movflags', '+faststart', '-an', dst], check=True)
print('frames', n, 'fps', fps, '->', dst)
