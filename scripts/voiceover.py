# Voiceover for the guide: Kokoro TTS (blend of am_fenrir + am_puck, ~121 Hz, expressive), then a studio chain
# (high-pass, presence EQ, de-ess, compression, loudness to -16 LUFS). Writes /tmp/guide/vo/<id>.wav + durations.json
import json, os, subprocess, numpy as np, soundfile as sf
from kokoro_onnx import Kokoro

K = Kokoro('/tmp/tts/kokoro-v1.0.onnx', '/tmp/tts/voices-v1.0.bin')
VOICE = np.add(K.get_voice_style('am_fenrir') * 0.5, K.get_voice_style('am_puck') * 0.5)
SPEED = 1.04
steps = json.load(open('/home/claude/charcoal/scripts/guide_script.json'))
out = '/tmp/guide/vo'; os.makedirs(out, exist_ok=True)
CHAIN = ('highpass=f=80,lowpass=f=15000,'
         'equalizer=f=200:t=q:w=1:g=-1.5,equalizer=f=3500:t=q:w=1.2:g=2.5,equalizer=f=11000:t=h:w=2000:g=1.5,'
         'deesser=i=0.35,acompressor=threshold=-20dB:ratio=3:attack=8:release=120:makeup=3,'
         'loudnorm=I=-16:TP=-1.5:LRA=7')
durs = {}
for s in steps:
    audio, sr = K.create(s['say'], voice=VOICE, speed=SPEED, lang='en-us')
    raw = f'{out}/{s["id"]}_raw.wav'
    sf.write(raw, audio, sr)
    dst = f'{out}/{s["id"]}.wav'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', raw, '-af', CHAIN, '-ar', '48000', '-ac', '1', dst], check=True)
    d = float(subprocess.check_output(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', dst]))
    durs[s['id']] = round(d, 3)
    print(f"{s['id']:7s} {d:5.1f}s  {s['say'][:60]}...")
json.dump(durs, open(f'{out}/durations.json', 'w'), indent=1)
print('total speech', round(sum(durs.values()), 1), 's')
