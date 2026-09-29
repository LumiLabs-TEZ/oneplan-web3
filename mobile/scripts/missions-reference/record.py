"""Record simulator motion while executing the corresponding repeatable Maestro flow."""
from pathlib import Path
from _common import add_evidence_argument
import argparse, os, signal, subprocess
parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('platform', choices=['rn','swift'])
add_evidence_argument(parser)
args=parser.parse_args()
EVIDENCE=args.evidence
EVIDENCE.mkdir(parents=True,exist_ok=True)
platform=args.platform
env=dict(os.environ, JAVA_HOME='/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home')
record=subprocess.Popen(['xcrun','simctl','io','booted','recordVideo','--codec=h264','--force',str(EVIDENCE/f'{platform}-motion.mp4')])
try:
    subprocess.run(['maestro','--device','370DE19F-D4A3-4E40-A22A-14CD55A3B3BA','test',str(Path(__file__).parent/f'{platform}.yaml'),'--test-output-dir',str(EVIDENCE)],env=env,check=True)
    if platform=='swift':
        subprocess.run(['maestro','--device','370DE19F-D4A3-4E40-A22A-14CD55A3B3BA','test',str(Path(__file__).parent/'swift-success.yaml'),'--test-output-dir',str(EVIDENCE)],env=env,check=True)
finally:
    record.send_signal(signal.SIGINT)
    record.wait(timeout=15)
