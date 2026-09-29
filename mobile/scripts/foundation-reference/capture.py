"""Capture all onboarding pages and back navigation, retaining originals and motion.
Requires a warm RN dev client on 8081 and the pinned FoundationReference installed.
"""
import argparse, hashlib, json, os, signal, subprocess, time
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
REVISION = '4723846f05f786e78883d41bdf7ac0976a80e81e'
p = argparse.ArgumentParser(description=__doc__)
p.add_argument('implementation', choices=['swift', 'ios', 'android'])
p.add_argument('--language', choices=['en', 'vi'], default='en')
p.add_argument('--device', default='370DE19F-D4A3-4E40-A22A-14CD55A3B3BA')
p.add_argument('--output', type=Path, required=True)
a = p.parse_args()
out = a.output.resolve() / a.language / a.implementation
out.mkdir(parents=True, exist_ok=True)
app = 'dev.oneplan.foundation-reference' if a.implementation == 'swift' else ('com.oneplan.android.dev' if a.implementation == 'android' else 'dev.lumilabs.oneplan')
if a.implementation == 'swift':
    subprocess.run(['xcrun','simctl','launch','--terminate-running-process',a.device,app,'-surface','onboarding','-AppleLanguages',f'({a.language})','-AppleLocale','vi_VN' if a.language == 'vi' else 'en_US'],check=True)
else:
    url = f'oneplan://foundation-reference?surface=onboarding&language={a.language}&run={time.time_ns()}'
    if a.implementation == 'ios':
        subprocess.run(['xcrun','simctl','openurl',a.device,url],check=True)
    else:
        subprocess.run(['adb','shell','am','start','-a','android.intent.action.VIEW','-d', "'"+url+"'"],check=True)
continue_label = 'Tiếp tục' if a.language == 'vi' else 'Continue'
flow = [f'appId: {app}', '---', '- extendedWaitUntil:', f'    visible: {json.dumps(continue_label)}', '    timeout: 30000']
for index in range(7):
    if index:
        flow += [f'- tapOn: {json.dumps(continue_label)}', '- waitForAnimationToEnd']
    flow += [f'- takeScreenshot: {json.dumps(str(out / f"onboarding-{index}"))}']
for index in range(5,-1,-1):
    back = ['- tapOn:', '    point: "8%,10%"'] if a.implementation == 'swift' else [f'- tapOn: {json.dumps("Quay lại" if a.language == "vi" else "Back")}']
    flow += back + ['- waitForAnimationToEnd', f'- takeScreenshot: {json.dumps(str(out / f"onboarding-back-{index}"))}']
flow_path = out / 'flow.yaml'
flow_path.write_text('\n'.join(flow)+'\n')
env = dict(os.environ, JAVA_HOME='/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home')
source_hashes = {str(f.relative_to(ROOT)): hashlib.sha256(f.read_bytes()).hexdigest() for folder in ['mobile/src', 'mobile/modules'] for f in sorted((ROOT/folder).rglob('*')) if f.is_file()}
video = None
if a.implementation != 'android':
    video = subprocess.Popen(['xcrun','simctl','io',a.device,'recordVideo',str(out/'onboarding.mp4')],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
else:
    video = subprocess.Popen(['adb','shell','screenrecord','--time-limit','180','/sdcard/phase9-onboarding.mp4'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
try:
    with (out/'execution.log').open('w') as log:
        result = subprocess.run([str(Path.home()/'.maestro/bin/maestro'),'--device',a.device,'test',str(flow_path)],env=env,stdout=log,stderr=subprocess.STDOUT,timeout=180)
finally:
    if video and a.implementation != 'android':
        video.send_signal(signal.SIGINT)
        video.wait(timeout=15)
    elif video:
        pid = subprocess.run(['adb','shell','pidof','screenrecord'],capture_output=True,text=True).stdout.strip()
        if pid: subprocess.run(['adb','shell','kill','-2',*pid.split()],check=True)
        video.wait(timeout=15)
        subprocess.run(['adb','pull','/sdcard/phase9-onboarding.mp4',str(out/'onboarding.mp4')],check=True,stdout=subprocess.DEVNULL)
manifest = {'referenceRevision': REVISION, 'language': a.language, 'implementation': a.implementation,
    'sourceHashes': source_hashes, 'fontScale': 1, 'viewportPixels': list(Image.open(out/'onboarding-0.png').size), 'reviewer': None, 'visualAcceptance': 'pending',
    'executionExitCode': result.returncode,
    'fixtureSHA256': hashlib.sha256((ROOT/'mobile/src/features/foundation/fixtures/overview.json').read_bytes()).hexdigest(),
    'files': {f.name: hashlib.sha256(f.read_bytes()).hexdigest() for f in out.iterdir() if f.is_file()}}
(out/'manifest.json').write_text(json.dumps(manifest,indent=2)+'\n')
raise SystemExit(result.returncode)
