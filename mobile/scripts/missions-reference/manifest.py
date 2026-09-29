"""Record capture provenance without modifying the original PNGs.

Run after reviewing captures for developer overlays. Declared state/scale describe the
capture session, not inferred proof of UI correctness; visual acceptance stays pending.
"""
import argparse
import hashlib
import json
from pathlib import Path
from PIL import Image
from _common import REVISION, ROOT


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('directory', type=Path)
    parser.add_argument('--font-scale', type=float, required=True)
    parser.add_argument('--language', choices=['en', 'vi'], required=True)
    parser.add_argument('--scenario', default='normal')
    args = parser.parse_args()
    if args.font_scale <= 0:
        parser.error('font scale must be positive')
    captures = []
    for path in sorted((args.directory / 'screenshots').glob('*.png')):
        with Image.open(path) as image:
            size = list(image.size)
        captures.append({
            'file': str(path.relative_to(args.directory)),
            'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
            'surface': path.stem.removeprefix('swift-').removeprefix('rn-').removesuffix('-ios').removesuffix('-android'),
            'implementation': 'swiftui' if path.stem.startswith('swift-') else 'react-native',
            'platform': 'android' if path.stem.endswith('-android') else 'ios',
            'language': args.language,
            'scenario': args.scenario,
            'viewportPixels': size,
            'fontScale': args.font_scale,
            'referenceRevision': REVISION,
            'fixtureSHA256': hashlib.sha256((ROOT / 'mobile/src/features/missions/fixtures/overview.json').read_bytes()).hexdigest(),
            'visualAcceptance': 'pending',
        })
    if not captures:
        parser.error('no screenshots found')
    (args.directory / 'capture-metadata.json').write_text(json.dumps(captures, indent=2) + '\n')


if __name__ == '__main__':
    main()
