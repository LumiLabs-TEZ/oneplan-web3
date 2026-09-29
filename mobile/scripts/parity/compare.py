"""Compare any paired surface with explicit provenance; never resize either capture."""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image, ImageChops

REFERENCE = '4723846f05f786e78883d41bdf7ac0976a80e81e'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('reference', type=Path)
    parser.add_argument('candidate', type=Path)
    parser.add_argument('--fixture', type=Path, required=True)
    parser.add_argument('--surface', required=True)
    parser.add_argument('--language', choices=['en', 'vi'], required=True)
    parser.add_argument('--platform', choices=['ios', 'android'], required=True)
    parser.add_argument('--font-scale', type=float, required=True)
    parser.add_argument('--scenario', default='normal')
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    reference = Image.open(args.reference).convert('RGB')
    candidate = Image.open(args.candidate).convert('RGB')
    if reference.size != candidate.size or args.font_scale <= 0:
        parser.error('Capture viewports must match and text scale must be positive')
    args.output.mkdir(parents=True, exist_ok=True)
    metadata = {
        'surface': args.surface, 'language': args.language, 'platform': args.platform,
        'scenario': args.scenario, 'fontScale': args.font_scale, 'viewportPixels': list(reference.size),
        'referenceRevision': REFERENCE, 'fixtureSHA256': hashlib.sha256(args.fixture.read_bytes()).hexdigest(),
        'reference': {'file': args.reference.name, 'sha256': hashlib.sha256(args.reference.read_bytes()).hexdigest()},
        'candidate': {'file': args.candidate.name, 'sha256': hashlib.sha256(args.candidate.read_bytes()).hexdigest()},
        'visualAcceptance': 'pending',
    }
    stem = f'{args.surface}-{args.platform}'
    (args.output / f'{stem}.json').write_text(json.dumps(metadata, indent=2) + '\n')
    Image.blend(reference, candidate, 0.5).save(args.output / f'{stem}-overlay.png')
    ImageChops.difference(reference, candidate).save(args.output / f'{stem}-difference.png')


if __name__ == '__main__':
    main()
