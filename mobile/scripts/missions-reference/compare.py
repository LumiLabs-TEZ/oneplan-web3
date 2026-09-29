"""Only equal-size captures are overlaid; images are never stretched to hide layout differences."""
import argparse, hashlib, json
from pathlib import Path
from _common import add_evidence_argument
from PIL import Image, ImageChops
parser=argparse.ArgumentParser(description=__doc__)
add_evidence_argument(parser)
EVIDENCE=parser.parse_args().evidence
manifest=EVIDENCE/'capture-metadata.json'
metadata={row['file']:row for row in json.loads(manifest.read_text())} if manifest.exists() else {}
def checked(path):
    row=metadata.get(str(path.relative_to(EVIDENCE)))
    if metadata and (not row or row['sha256']!=hashlib.sha256(path.read_bytes()).hexdigest()):
        raise ValueError(f'Missing or stale capture metadata: {path}')
    return row
for surface in ['missions','missions-vi','redeem','success','terms']:
    reference_path=EVIDENCE/'screenshots'/f'swift-{surface}.png'
    if not reference_path.exists(): continue
    reference=Image.open(reference_path).convert('RGB')
    for platform in ['ios','android']:
        path=EVIDENCE/'screenshots'/f'rn-{surface}-{platform}.png'
        if not path.exists(): continue
        source_metadata, candidate_metadata=checked(reference_path), checked(path)
        if source_metadata and any(source_metadata[key]!=candidate_metadata[key] for key in ['surface','language','scenario','viewportPixels','fontScale','referenceRevision','fixtureSHA256']):
            raise ValueError(f'Capture state mismatch: {reference_path} vs {path}')
        candidate=Image.open(path).convert('RGB')
        if candidate.size!=reference.size:
            print(f'{surface}/{platform}: viewport mismatch {candidate.size} vs {reference.size}; no scaled comparison')
            continue
        Image.blend(reference,candidate,.5).save(EVIDENCE/f'overlay-{surface}-{platform}.png')
        ImageChops.difference(reference,candidate).save(EVIDENCE/f'difference-{surface}-{platform}.png')
