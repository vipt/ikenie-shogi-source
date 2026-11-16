"""Generate the original, short wooden placement sound bundled with the app."""
from pathlib import Path
import math, random, struct, wave
rate = 44100
rng = random.Random(20261114)
samples = []
last = 0
for i in range(int(rate * .115)):
    t = i / rate
    noise = rng.uniform(-1, 1)
    high = noise - last
    last = noise
    attack = min(1, t / .0005)
    value = attack * (.22 * high * math.exp(-t / .0035)
        + .28 * math.sin(2 * math.pi * 1780 * t) * math.exp(-t / .011)
        + .20 * math.sin(2 * math.pi * 2960 * t) * math.exp(-t / .007)
        + .16 * math.sin(2 * math.pi * 710 * t) * math.exp(-t / .019))
    samples.append(max(-32767, min(32767, round(value * 28000))))
# Padding prevents Android's short-PCM preload from reaching EOF before the first play.
samples.extend([0] * (int(rate * .5) - len(samples)))
path = Path(__file__).resolve().parent.parent / 'assets/audio/piece-move.wav'
path.parent.mkdir(exist_ok=True)
with wave.open(str(path), 'wb') as output:
    output.setnchannels(1)
    output.setsampwidth(2)
    output.setframerate(rate)
    output.writeframes(struct.pack('<' + 'h' * len(samples), *samples))
