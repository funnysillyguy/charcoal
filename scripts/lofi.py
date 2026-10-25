# Original lo-fi loop, synthesized from scratch: Rhodes-ish chords, soft bass, swung boom-bap, vinyl crackle.
# usage: python3 lofi.py OUT.wav SECONDS
import sys, numpy as np
from scipy.signal import butter, sosfilt
from scipy.io import wavfile

SR = 44100
out_path, dur = sys.argv[1], float(sys.argv[2])
rng = np.random.default_rng(7)
BPM = 76; beat = 60 / BPM; bar = beat * 4
n = int(SR * (dur + 1))
mix = np.zeros((n, 2))

def midi(m): return 440 * 2 ** ((m - 69) / 12)
def add(sig, t, pan=0.0, gain=1.0):
    i = int(t * SR); j = min(n, i + len(sig))
    if i >= n: return
    l, r = np.cos((pan + 1) * np.pi / 4), np.sin((pan + 1) * np.pi / 4)
    mix[i:j, 0] += sig[: j - i] * gain * l; mix[i:j, 1] += sig[: j - i] * gain * r

def rhodes(freq, length, vel=1.0):
    t = np.arange(int(length * SR)) / SR
    env = np.exp(-t * 1.4) * (1 - np.exp(-t * 35))
    tone = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(2 * np.pi * freq * 2 * t + 0.4) * np.exp(-t * 4)
            + 0.12 * np.sin(2 * np.pi * freq * 3.01 * t) * np.exp(-t * 7))
    trem = 1 + 0.12 * np.sin(2 * np.pi * 4.2 * t)
    return tone * env * trem * vel

def kick():
    t = np.arange(int(0.45 * SR)) / SR
    f = 45 + 75 * np.exp(-t * 28)
    return np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 7.5)

def noise(length):
    return rng.standard_normal(int(length * SR))

bp = butter(2, [900, 5000], btype='band', fs=SR, output='sos')
hp = butter(2, 3800, btype='high', fs=SR, output='sos')
def snare():
    t = np.arange(int(0.3 * SR)) / SR
    return sosfilt(bp, noise(0.3)) * np.exp(-t * 16) * 0.55 + np.sin(2 * np.pi * 185 * t) * np.exp(-t * 22) * 0.35
def hat(open_=False):
    L = 0.18 if open_ else 0.05
    t = np.arange(int(L * SR)) / SR
    return sosfilt(hp, noise(L)) * np.exp(-t * (18 if open_ else 70))

# Fmaj9 - Em7 - Dm9 - Cmaj7 (voicings in MIDI)
CHORDS = [([53, 57, 60, 64, 67], 41), ([52, 55, 59, 62, 67], 40), ([50, 53, 57, 60, 64], 38), ([48, 52, 55, 59, 62], 36)]
swing = beat * 0.08
bars = int(dur / bar) + 2
for b in range(bars):
    t0 = b * bar
    notes, root = CHORDS[b % 4]
    for k, m in enumerate(notes):  # slightly strummed
        add(rhodes(midi(m), bar * 1.1, 0.085), t0 + k * 0.014, pan=(k - 2) * 0.18)
    add(rhodes(midi(notes[-1] + 12), beat * 1.2, 0.05), t0 + beat * 2.5 + swing, pan=0.4)  # little top-note answer
    tb = np.arange(int(bar * SR)) / SR
    bass = np.sin(2 * np.pi * midi(root) * tb) * np.exp(-tb * 0.9) * (1 - np.exp(-tb * 60))
    add(bass * 0.24, t0)
    if b == 0: continue  # drums come in on bar 2
    for q in range(4):
        tq = t0 + q * beat
        if q in (0, 2): add(kick() * 0.85, tq)
        if q == 2 and b % 2: add(kick() * 0.5, tq + beat * 0.5 + swing)
        if q in (1, 3): add(snare() * 0.78, tq, pan=0.05)
        add(hat() * 0.2, tq, pan=-0.25)
        add(hat(q == 3 and b % 4 == 3) * 0.13, tq + beat / 2 + swing, pan=-0.25)

# vinyl: soft hiss + sparse crackle
hiss = sosfilt(butter(1, 3000, btype='low', fs=SR, output='sos'), rng.standard_normal(n)) * 0.006
crack = np.zeros(n); idx = rng.choice(n, size=int(dur * 9), replace=False); crack[idx] = rng.uniform(-0.25, 0.25, len(idx))
mix += np.stack([hiss + crack, hiss + np.roll(crack, 37)], axis=1)

# warm it up: low-pass "through the wall" + gentle saturation
lp = butter(3, 5600, btype='low', fs=SR, output='sos')
mix = np.stack([sosfilt(lp, mix[:, 0]), sosfilt(lp, mix[:, 1])], axis=1)
mix = np.tanh(mix * 1.6) / 1.6
mix = mix[: int(dur * SR)]
fade_in, fade_out = int(0.8 * SR), int(2.2 * SR)
mix[:fade_in] *= np.linspace(0, 1, fade_in)[:, None]
mix[-fade_out:] *= np.linspace(1, 0, fade_out)[:, None] ** 1.5
mix *= 0.85 / max(1e-6, np.abs(mix).max())
wavfile.write(out_path, SR, (mix * 32767).astype(np.int16))
print('wrote', out_path, round(dur, 1), 's')
