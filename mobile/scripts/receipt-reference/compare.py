"""Create same-size, 50% overlays from captured reference/RN fixtures. No acceptance threshold.
Run from the repository root. Requires Pillow. Original captures remain unmodified.
"""
from pathlib import Path
from PIL import Image, ImageChops, ImageStat
import json
ROOT = Path(__file__).resolve().parents[3]
EVIDENCE = ROOT / 'docs/superpowers/specs/parity/evidence/phase6'
states = ['capture','parsing','initial','assigned','exhausted','split-selection','split-hover','reset-countdown','saving','error']
metrics = {}
for state in states:
    swift, rn = [EVIDENCE / f'{platform}-{state}.png' for platform in ['swift', 'rn']]
    if not swift.exists() or not rn.exists(): continue
    reference, actual = Image.open(swift).convert('RGB'), Image.open(rn).convert('RGB')
    assert reference.size == actual.size, (state, reference.size, actual.size)
    Image.blend(reference, actual, 0.5).save(EVIDENCE / f'overlay-{state}.png')
    # Exclude the status bar (62 points at 3x) which includes the previous application's name.
    difference = ImageChops.difference(reference, actual).crop((0, 186, reference.width, reference.height))
    metrics[state] = { 'size': reference.size, 'mean_absolute_channel_difference_0_to_255': round(sum(ImageStat.Stat(difference).mean) / 3, 3) }
(EVIDENCE / 'image-differences.json').write_text(json.dumps(metrics, indent=2) + '\n')
print(json.dumps(metrics, indent=2))
