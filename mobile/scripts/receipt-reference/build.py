"""Build original SwiftUI receipt views in an isolated simulator app; never edit the iOS app.
Run from anywhere: python3 mobile/scripts/receipt-reference/build.py
"""
from pathlib import Path
import hashlib, json, plistlib, shutil, subprocess, tempfile
ROOT = Path(__file__).resolve().parents[3]
REVISION = '4723846f05f786e78883d41bdf7ac0976a80e81e'
SOURCE_PREFIX = 'ios/OnePlan/OnePlan'
WORK = Path(tempfile.mkdtemp(prefix='oneplan-receipt-reference-'))
APP = WORK / 'ReceiptReference.app'
APP.mkdir()
# Export only the pinned tree; local iOS edits must never alter the reference.
SOURCE = WORK / 'source'
SOURCE.mkdir()
paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', REVISION, '--', SOURCE_PREFIX], cwd=ROOT, text=True).splitlines()
for path in paths:
    destination = SOURCE / Path(path).relative_to(SOURCE_PREFIX)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(subprocess.check_output(['git', 'show', f'{REVISION}:{path}'], cwd=ROOT))
files = ['Constants.swift', 'Extension/Font+BeVietnamPro.swift', 'Component/Common/LiquidGlassCompat.swift', 'Component/Common/Button/ToolbarIconButton.swift', 'Services/CameraKit.swift', 'View/Bill/DnDBillItemsView.swift', 'View/Bill/ScanBillView.swift', 'Component/Common/Currency/CurrencyFormatter.swift']
for relative in files:
    text = (SOURCE / relative).read_text().split('#Preview')[0]
    if relative.endswith('CurrencyFormatter.swift'):
        start = text.index('    /// Convert from OpenAPI')
        end = text.index('    static let USD')
        text = text[:start] + text[end:]
    if relative.endswith('DnDBillItemsView.swift'):
        # Stable member UUIDs from the shared fixture; production logic and layout untouched.
        text = text.replace('struct DnDBillMemberItem: Identifiable {\n    let id = UUID()', 'struct DnDBillMemberItem: Identifiable {\n    let id: UUID')
    (WORK / Path(relative).name).write_text(text)
shutil.copy(Path(__file__).parent / 'Reference.swift', WORK)
shutil.copy(ROOT / 'mobile/src/features/receipt/fixtures/receipt.json', APP / 'receipt.json')
fonts = list((SOURCE / 'Resources/Fonts').glob('BeVietnamPro-*.ttf'))
for font in fonts: shutil.copy(font, APP / font.name)
assets = WORK / 'Assets.xcassets'
assets.mkdir()
for name in ['placeholder/receiptPlaceholder.imageset', 'placeholder/avatarPlaceholder.imageset']:
    shutil.copytree(SOURCE / 'Assets.xcassets' / name, assets / Path(name).name)
plist = {'CFBundleIdentifier':'dev.oneplan.receipt-reference','CFBundleExecutable':'ReceiptReference','CFBundleName':'ReceiptReference','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','MinimumOSVersion':'17.0','LSRequiresIPhoneOS':True,'UILaunchScreen':{},'UIDeviceFamily':[1],'UIAppFonts':[p.name for p in fonts],'NSCameraUsageDescription':'Receipt reference camera','UISupportedInterfaceOrientations':['UIInterfaceOrientationPortrait']}
(APP / 'Info.plist').write_bytes(plistlib.dumps(plist))
sdk = subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','actool',str(assets),'--compile',str(APP),'--platform','iphonesimulator','--minimum-deployment-target','17.0','--target-device','iphone'],check=True)
subprocess.run(['xcrun','swiftc','-sdk',sdk,'-target','arm64-apple-ios17.0-simulator','-parse-as-library',*[str(p) for p in WORK.glob('*.swift')],'-o',str(APP/'ReceiptReference')],check=True)
catalog = WORK / 'Localizable.xcstrings'
shutil.copy(SOURCE / 'Localizable.xcstrings', catalog)
subprocess.run(['xcrun', 'xcstringstool', 'compile', str(catalog), '--output-directory', str(APP)], check=True)
(APP / 'reference-metadata.json').write_text(json.dumps({
    'referenceRevision': REVISION,
    'sourceHashes': {str(p.relative_to(SOURCE)): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(SOURCE.rglob('*')) if p.is_file()},
    'harnessHash': hashlib.sha256(Path(__file__).read_bytes()).hexdigest(),
}, indent=2) + '\n')
subprocess.run(['codesign','--force','--sign','-',str(APP)],check=True)
subprocess.run(['xcrun','simctl','install','booted',str(APP)],check=True)
print(APP)
