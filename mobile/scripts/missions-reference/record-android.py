"""Record the Android happy path on the connected emulator."""
from pathlib import Path
from _common import add_evidence_argument
import argparse, os, subprocess
parser=argparse.ArgumentParser(description=__doc__)
add_evidence_argument(parser)
EVIDENCE=parser.parse_args().evidence
EVIDENCE.mkdir(parents=True,exist_ok=True)
ADB = '/opt/homebrew/share/android-commandlinetools/platform-tools/adb'
env = dict(os.environ, JAVA_HOME='/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home')
record = subprocess.Popen([ADB, 'shell', 'screenrecord', '--time-limit', '180', '/sdcard/phase8-android-motion.mp4'])
try:
    subprocess.run(['maestro', '--device', 'emulator-5554', 'test', str(Path(__file__).parent / 'android.yaml'), '--test-output-dir', str(EVIDENCE)], env=env, check=True)
finally:
    subprocess.run([ADB, 'shell', 'pkill', '-2', 'screenrecord'], check=False)
    record.wait(timeout=15)
    subprocess.run([ADB, 'pull', '/sdcard/phase8-android-motion.mp4', str(EVIDENCE / 'android-motion.mp4')], check=True)
