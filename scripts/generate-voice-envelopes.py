"""Generate 50 Hz mouth-opening envelopes from the published PCM voice clips."""
import array
import json
import math
import sys
import wave
from pathlib import Path

root = Path(__file__).resolve().parents[1]
envelopes = {}
for path in sorted((root / 'public/voice').glob('*.wav')):
    with wave.open(str(path)) as audio:
        assert audio.getsampwidth() == 2 and audio.getnchannels() == 1
        samples = array.array('h', audio.readframes(audio.getnframes()))
        if sys.byteorder != 'little':
            samples.byteswap()
        step = round(audio.getframerate() / 50)
    levels = []
    for start in range(0, len(samples), step):
        block = samples[start:start + step]
        rms = math.sqrt(sum((v / 32768) ** 2 for v in block) / len(block))
        levels.append(rms)
    peak = max(max(levels), 0.01)
    envelopes[f'/voice/{path.name}'] = {
        'fps': 50,
        'samples': [round(min(0.85, max(0, (v - 0.008) / peak) ** 0.65), 3) for v in levels],
    }
(root / 'lib/voiceEnvelopes.json').write_text(json.dumps(envelopes, separators=(',', ':')) + '\n')
