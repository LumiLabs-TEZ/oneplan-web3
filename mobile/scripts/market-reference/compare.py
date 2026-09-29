"""Diagnostic overlays only; local visual defects cannot be waived by an aggregate score."""
from pathlib import Path
from PIL import Image, ImageChops
ROOT=Path(__file__).resolve().parents[3]
EVIDENCE=ROOT/'docs/superpowers/specs/parity/evidence/phase7'
reference=Image.open(EVIDENCE/'swift-cards.png').convert('RGB')
for platform in ['ios','android']:
    candidate=Image.open(EVIDENCE/f'rn-cards-{platform}.png').convert('RGB')
    if candidate.size!=reference.size:
        print(f'{platform}: viewport differs: {candidate.size} vs {reference.size}; no resized comparison')
        continue
    Image.blend(reference,candidate,.5).save(EVIDENCE/f'overlay-cards-{platform}.png')
    ImageChops.difference(reference,candidate).save(EVIDENCE/f'difference-cards-{platform}.png')
