"""Shared constants and CLI arguments for the missions reference scripts."""
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
# Swift source pinned for the reference build; manifest.py stamps captures with the same value so
# compare.py can reject evidence recorded against a different revision.
REVISION = '4723846f05f786e78883d41bdf7ac0976a80e81e'
DEFAULT_EVIDENCE = ROOT / 'docs/superpowers/specs/parity/evidence/phase8'


def add_evidence_argument(parser):
    parser.add_argument('--evidence', type=Path, default=DEFAULT_EVIDENCE)
    return parser
