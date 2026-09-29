"""Inventory existing acceptance contracts and fail closed before store submission."""
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[3]
DIRECTORY = ROOT / 'docs/superpowers/specs/parity'
RECORD = DIRECTORY / 'phase9-acceptance.json'
CONTRACTS = ['rn-parity-checklist.md', 'phase7-marketplace-checklist.md']
REFERENCE = '4723846f05f786e78883d41bdf7ac0976a80e81e'


def inventory():
    result = []
    for filename in CONTRACTS:
        section = ''
        for line in (DIRECTORY / filename).read_text().splitlines():
            if line.startswith('#'):
                section = line.lstrip('# ').strip()
            if not line.startswith('|'):
                continue
            cells = [cell.strip() for cell in line.strip('|').split('|')]
            statuses = [cell for cell in cells if cell in ['⬜', '🟡', '🟢', '⚫', 'Pending']]
            if not statuses or all(status == '⚫' for status in statuses):
                continue
            identity = f'{filename}/{section}/{cells[0]}'
            result.append({'id': hashlib.sha256(identity.encode()).hexdigest()[:16],
                           'contract': filename, 'section': section, 'surface': cells[0]})
    if len({row['id'] for row in result}) != len(result):
        raise ValueError('Ambiguous duplicate acceptance rows')
    return result


def validate(record, expected, mobile_tree):
    errors = []
    if record.get('referenceRevision') != REFERENCE:
        errors.append('SwiftUI reference revision mismatch')
    if record.get('mobileTree') != mobile_tree:
        errors.append('Acceptance does not cover this mobile source tree')
    rows = record.get('surfaces', [])
    if len(rows) != len(expected) or {row.get('id') for row in rows} != {row['id'] for row in expected}:
        errors.append('Acceptance inventory does not match active contracts')
    for row in rows:
        for platform in ['ios', 'android']:
            review = row.get(platform, {})
            for gate in ['functional', 'visual', 'motion', 'device']:
                if review.get(gate) != 'accepted':
                    errors.append(f"{row.get('id')}/{platform}/{gate} pending")
            if not review.get('reviewer') or not review.get('evidence'):
                errors.append(f"{row.get('id')}/{platform} missing review evidence")
            for artifact in review.get('evidence', []):
                path = (ROOT / artifact.get('file', '')).resolve()
                if not path.is_relative_to(DIRECTORY) or not path.is_file():
                    errors.append('Evidence file missing or outside parity directory')
                elif hashlib.sha256(path.read_bytes()).hexdigest() != artifact.get('sha256'):
                    errors.append('Evidence hash mismatch')
    return errors


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--initialize', action='store_true')
    args = parser.parse_args()
    expected = inventory()
    if args.initialize:
        if RECORD.exists():
            parser.error('Refusing to replace an existing acceptance record')
        for row in expected:
            for platform in ['ios', 'android']:
                row[platform] = {gate: 'pending' for gate in ['functional', 'visual', 'motion', 'device']}
                row[platform].update({'reviewer': None, 'evidence': []})
        RECORD.write_text(json.dumps({'schemaVersion': 1, 'referenceRevision': REFERENCE,
                                     'mobileTree': None, 'surfaces': expected}, indent=2) + '\n')
        print(f'Initialized {len(expected)} contracts; no acceptance inferred from implementation.')
        return
    mobile_tree = subprocess.check_output(['git', 'rev-parse', 'HEAD:mobile'], cwd=ROOT, text=True).strip()
    errors = validate(json.loads(RECORD.read_text()), expected, mobile_tree)
    if errors:
        print('\n'.join(errors[:12]))
        raise SystemExit(f'Submission blocked: {len(errors)} outstanding acceptance requirements.')
    print(f'{len(expected)} contracts accepted on both platforms for this mobile source tree.')


if __name__ == '__main__':
    main()
