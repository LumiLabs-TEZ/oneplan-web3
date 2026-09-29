"""Build unmodified production Missions view bodies against deterministic local services."""
from pathlib import Path
import hashlib, json, plistlib, shutil, subprocess, tempfile
ROOT = Path(__file__).resolve().parents[3]
REVISION = '4723846f05f786e78883d41bdf7ac0976a80e81e'
SOURCE_PREFIX = 'ios/OnePlan/OnePlan'
def source_bytes(relative):
    return subprocess.check_output(['git', 'show', f'{REVISION}:{SOURCE_PREFIX}/{relative}'], cwd=ROOT)
def source_paths():
    return subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', REVISION, '--', SOURCE_PREFIX], cwd=ROOT, text=True).splitlines()
PATHS = source_paths()
WORK = Path(tempfile.mkdtemp(prefix='oneplan-foundation-reference-'))
APP = WORK / 'FoundationReference.app'; APP.mkdir()
files = ['Constants.swift','Extension/Font+BeVietnamPro.swift','Component/Common/LiquidGlassCompat.swift','Component/Button/PrimaryButton.swift','Component/Common/StyledQRCodeView.swift','Component/Note/NoteCardRow.swift','Component/LocationDetail/LocationCompassWidget.swift','Component/Common/PlanImageStrip.swift','Component/Common/HeroLightbox.swift','View/FreeTrialView.swift','Component/Button/SecondaryButton.swift','Component/Common/Button/ToolbarIconButton.swift','View/Onboarding/OnboardingView.swift','View/Onboarding/OnboardingItem.swift']
for relative in files:
    (WORK / Path(relative).name).write_text(source_bytes(relative).decode().split('#Preview')[0])
shutil.copy(Path(__file__).parent / 'Reference.swift', WORK)
shutil.copy(ROOT / 'mobile/src/features/foundation/fixtures/overview.json', APP / 'overview.json')
fonts = [Path(p) for p in PATHS if '/Resources/Fonts/BeVietnamPro-' in p and p.endswith('.ttf')]
for font in fonts: (APP / font.name).write_bytes(source_bytes(str(font.relative_to(SOURCE_PREFIX))))
assets = WORK / 'Assets.xcassets'; assets.mkdir()
for name in ['welcome-to-oneplan','track-group-expense','plan-your-trip','board-extract-video','explore-plan-market','scan-bills-ai','settle-with-ease','freeTrialScooter','oneplanPaywallPromo','rewardBolt','rewardPro30d']:
    destination = assets / (name + '.imageset'); destination.mkdir()
    for path in PATHS:
        if f'/{name}.imageset/' in path:
            (destination / Path(path).name).write_bytes(source_bytes(str(Path(path).relative_to(SOURCE_PREFIX))))
plist = {'CFBundleIdentifier':'dev.oneplan.foundation-reference','CFBundleExecutable':'FoundationReference','CFBundleName':'FoundationReference','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','MinimumOSVersion':'17.0','LSRequiresIPhoneOS':True,'UILaunchScreen':{},'UIDeviceFamily':[1],'UIAppFonts':[p.name for p in fonts]}
(APP / 'Info.plist').write_bytes(plistlib.dumps(plist))
sdk = subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','actool',str(assets),'--compile',str(APP),'--platform','iphonesimulator','--minimum-deployment-target','17.0','--target-device','iphone'],check=True)
subprocess.run(['xcrun','swiftc','-sdk',sdk,'-target','arm64-apple-ios17.0-simulator','-parse-as-library',*[str(p) for p in WORK.glob('*.swift')],'-o',str(APP/'FoundationReference')],check=True)
catalog = WORK / 'Localizable.xcstrings'
catalog.write_bytes(source_bytes('Localizable.xcstrings'))
subprocess.run(['xcrun','xcstringstool','compile',str(catalog),'--output-directory',str(APP)],check=True)
(APP / 'reference-metadata.json').write_text(json.dumps({'referenceRevision': REVISION, 'fixture': 'mobile/src/features/foundation/fixtures/overview.json', 'productionViewBodies': files, 'sourceHashes': {f: hashlib.sha256(source_bytes(f)).hexdigest() for f in files}, 'fixtureSHA256': hashlib.sha256((APP / 'overview.json').read_bytes()).hexdigest(), 'harnessSHA256': hashlib.sha256((WORK / 'Reference.swift').read_bytes()).hexdigest()}, indent=2) + '\n')
subprocess.run(['codesign','--force','--sign','-',str(APP)],check=True)
subprocess.run(['xcrun','simctl','install','booted',str(APP)],check=True)
subprocess.run(['xcrun','simctl','launch','booted','dev.oneplan.foundation-reference'],check=True)
print(APP)
