# Final edit of the narrated guide: recording + key card + outro, cursor + tap push-ins, captions,
# voiceover placed per step, lo-fi music ducked under the voice. Output: public/guide-own-key.mp4
import json, math, os, subprocess, sys
import cv2, numpy as np, soundfile as sf
from PIL import Image, ImageDraw, ImageFont

R = '/tmp/guide2'; VO = '/tmp/guide/vo'
LOG = json.load(open(f'{R}/log.json'))
CARD = json.load(open(f'{R}/card/log.json'))
OUTRO = json.load(open('/tmp/guide/outro/log.json'))
steps = json.load(open('/home/claude/charcoal/scripts/guide_script.json'))
durs = json.load(open(f'{VO}/durations.json'))
VO_OFFSET, FPS, XF = 0.3, 30, 0.3
OUT_W, SCREEN_H, CAP_H = 720, 1558, 118
OUT_H = SCREEN_H + CAP_H
FONT = ImageFont.truetype('/usr/share/fonts/opentype/inter/Inter-SemiBold.otf', 30)
BG = (16, 13, 13)

FR = np.array(LOG['frames']); CF = np.array(CARD['frames']); OF = np.array(OUTRO['frames'])
cur = np.array(LOG['cursor']); clicks = LOG['clicks']

def pick(arr, t): return max(0, int(np.searchsorted(arr, t, side='right')) - 1)
_cache = {}
def img(path):
    if path not in _cache:
        if len(_cache) > 6: _cache.clear()
        _cache[path] = cv2.imread(path)
    return _cache[path]

def cursor_at(t):
    if t <= cur[0, 0]: return cur[0, 1:]
    if t >= cur[-1, 0]: return cur[-1, 1:]
    i = np.searchsorted(cur[:, 0], t); a, b = cur[i - 1], cur[i]
    k = (t - a[0]) / max(1e-6, b[0] - a[0]); return a[1:] + (b[1:] - a[1:]) * k

def draw_cursor(im, t):
    S = im.shape[1] / 390
    x, y = cursor_at(t) * S
    press = 0.0
    for c in clicks:
        d = t - c
        if 0 <= d < 0.18: press = max(press, 1 - abs(d - 0.06) / 0.12)
        if 0 <= d < 0.6:
            k = d / 0.6; ov = im.copy()
            cv2.circle(ov, (int(x), int(y)), int((12 + 26 * k) * S), (255, 255, 255), max(1, int(2 * S)), cv2.LINE_AA)
            cv2.addWeighted(ov, 0.9 * (1 - k), im, 1 - 0.9 * (1 - k), 0, im)
    r = int((17 - 4 * press) * S)
    ov = im.copy(); cv2.circle(ov, (int(x), int(y + 2 * S)), r + int(3 * S), (0, 0, 0), -1, cv2.LINE_AA); cv2.addWeighted(ov, 0.28, im, 0.72, 0, im)
    ov = im.copy(); cv2.circle(ov, (int(x), int(y)), r, (255, 255, 255), -1, cv2.LINE_AA); cv2.addWeighted(ov, 0.28 + 0.3 * press, im, 0.72 - 0.3 * press, 0, im)
    cv2.circle(im, (int(x), int(y)), r, (255, 255, 255), max(2, int(2.5 * S)), cv2.LINE_AA)

def zoom_at(t):
    z = 1.0
    for c in clicks:
        d = t - c
        if -0.5 < d < 1.0: z = max(z, 1.0 + 0.14 * math.exp(-((d - 0.1) ** 2) / 0.14))
    return z

def caption_layer(text, alpha):
    im = Image.new('RGBA', (OUT_W, CAP_H), BG + (255,))
    if text and alpha > 0:
        d = ImageDraw.Draw(im); tw = d.textlength(text, font=FONT); w, h = tw + 52, 64
        x0, y0 = (OUT_W - w) / 2, (CAP_H - h) / 2
        d.rounded_rectangle([x0, y0, x0 + w, y0 + h], radius=32, fill=(28, 26, 28, int(255 * alpha)), outline=(255, 255, 255, int(40 * alpha)), width=2)
        d.text((x0 + 26, y0 + 14), text, font=FONT, fill=(250, 250, 250, int(255 * alpha)))
    return cv2.cvtColor(np.array(im.convert('RGB')), cv2.COLOR_RGB2BGR)

# ---- timeline ----
segs = []; t = 0.0
for s in steps:
    if s['kind'] == 'rec':
        a, b = LOG['steps'][s['id']]; L = b - a
    elif s['kind'] == 'card':
        a, L = 0.0, CARD['len']
    else:
        a, L = 0.0, 3.6
    segs.append({**s, 'out0': t, 'src0': a, 'len': L}); t += L
TOTAL = t
print('timeline', [(x['id'], round(x['out0'], 1), round(x['len'], 1)) for x in segs], 'total', round(TOTAL, 1))

cam = {'cx': None, 'cy': None, 'z': 1.0}
def render(seg, lt):
    if seg['kind'] == 'outro':
        f = img(f'/tmp/guide/outro/{pick(OF, lt):05d}.jpg')
        return f if f.shape[:2] == (OUT_H, OUT_W) else cv2.resize(f, (OUT_W, OUT_H))
    if seg['kind'] == 'card':
        screen = img(f'{R}/card/{pick(CF, lt):05d}.jpg')
        screen = screen if screen.shape[:2] == (SCREEN_H, OUT_W) else cv2.resize(screen, (OUT_W, SCREEN_H))
    else:
        st = seg['src0'] + lt
        fr = img(f'{R}/frames/{pick(FR, st):05d}.jpg').copy()
        draw_cursor(fr, st)
        SH, SW = fr.shape[:2]
        tx, ty = cursor_at(st) * (SW / 390)
        if cam['cx'] is None: cam['cx'], cam['cy'] = tx, ty
        ap = 1 - math.exp(-1 / FPS / 0.22); az = 1 - math.exp(-1 / FPS / 0.35)
        cam['cx'] += (tx - cam['cx']) * ap; cam['cy'] += (ty - cam['cy']) * ap; cam['z'] += (zoom_at(st) - cam['z']) * az
        w, h = SW / cam['z'], SH / cam['z']
        x0 = min(max(cam['cx'] - w / 2, 0), SW - w); y0 = min(max(cam['cy'] - h / 2, 0), SH - h)
        screen = cv2.resize(fr[int(y0):int(y0 + h), int(x0):int(x0 + w)], (OUT_W, SCREEN_H), interpolation=cv2.INTER_AREA)
    out = np.empty((OUT_H, OUT_W, 3), np.uint8)
    out[:CAP_H] = caption_layer(seg['caption'], min(1, lt / 0.25))
    out[CAP_H:] = screen
    return out

tmp = f'{R}/edit.mp4'
vw = cv2.VideoWriter(tmp, cv2.VideoWriter_fourcc(*'mp4v'), FPS, (OUT_W, OUT_H))
prev_last = None; si = 0
for n in range(int(TOTAL * FPS)):
    tt = n / FPS
    while si + 1 < len(segs) and tt >= segs[si + 1]['out0']:
        si += 1
    seg = segs[si]; lt = tt - seg['out0']
    frame = render(seg, lt)
    if si > 0 and lt < XF and segs[si - 1]['kind'] != seg['kind']:
        p = segs[si - 1]; frame = cv2.addWeighted(frame, lt / XF, render(p, p['len'] - 1 / FPS), 1 - lt / XF, 0)
    vw.write(frame)
vw.release()

# ---- audio: voice per step + ducked lo-fi ----
SR = 48000
voice = np.zeros(int((TOTAL + 1) * SR), np.float32)
for seg in segs:
    v, sr = sf.read(f'{VO}/{seg["id"]}.wav', dtype='float32')
    i = int((seg['out0'] + VO_OFFSET) * SR); voice[i:i + len(v)] += v[: len(voice) - i]
voice = voice[: int(TOTAL * SR)]
sf.write(f'{R}/voice.wav', voice, SR)
subprocess.run([sys.executable, '/home/claude/charcoal/scripts/lofi.py', f'{R}/music.wav', f'{TOTAL:.2f}'], check=True)
dst = '/home/claude/charcoal/public/guide-own-key.mp4'
fc = ('[1:a]aresample=48000,volume=0.5[m];[2:a]asplit=2[v1][v2];'
      '[m][v1]sidechaincompress=threshold=0.02:ratio=10:attack=25:release=450:makeup=1[md];'
      '[md][v2]amix=inputs=2:weights=0.55 1:normalize=0,alimiter=limit=0.95[a]')
subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', tmp, '-i', f'{R}/music.wav', '-i', f'{R}/voice.wav',
                '-filter_complex', fc, '-map', '0:v', '-map', '[a]', '-c:v', 'libx264', '-preset', 'veryslow', '-crf', '34', '-tune', 'stillimage',
                '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '112k', '-shortest', '-movflags', '+faststart', dst], check=True)
print('->', dst, round(TOTAL, 1), 's')
