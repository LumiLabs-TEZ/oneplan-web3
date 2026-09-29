"""Capture the production SwiftUI marketplace card with bundled assets, without modifying iOS."""
from pathlib import Path
import hashlib, json, plistlib, shutil, subprocess, tempfile
ROOT = Path(__file__).resolve().parents[3]
REVISION = '4723846f05f786e78883d41bdf7ac0976a80e81e'
SOURCE_PREFIX = 'ios/OnePlan/OnePlan'
WORK = Path(tempfile.mkdtemp(prefix='oneplan-market-reference-'))
APP = WORK / 'MarketReference.app'
APP.mkdir()
# Export only the pinned tree; local iOS edits must never alter the reference.
SOURCE = WORK / 'source'
SOURCE.mkdir()
paths = subprocess.check_output(['git', 'ls-tree', '-r', '--name-only', REVISION, '--', SOURCE_PREFIX], cwd=ROOT, text=True).splitlines()
for path in paths:
    destination = SOURCE / Path(path).relative_to(SOURCE_PREFIX)
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(subprocess.check_output(['git', 'show', f'{REVISION}:{path}'], cwd=ROOT))
for relative in ['Constants.swift', 'Component/Marketplace/MarketplaceItem.swift', 'Component/Common/ListingTag.swift', 'Component/ImageHolder/MarketplaceThumbnailImageHolder.swift']:
    (WORK / Path(relative).name).write_text((SOURCE / relative).read_text().split('#Preview')[0])
(WORK / 'Reference.swift').write_text('''import SwiftUI
// Only API model declarations and the unused network-image loader are isolated.
enum Components { enum Schemas {
 enum ListingTag: String { case SOLO, FRIENDS, COUPLES, FAMILY, COMPANY }
 enum MarketplaceListingStatus { case DRAFT, PENDING_REVIEW, APPROVED, REJECTED }
}}
struct CachedRemoteImage<Content: View, Placeholder: View>: View {
 let url: URL; let targetSize: CGSize; @ViewBuilder let content: (Image) -> Content; @ViewBuilder let placeholder: () -> Placeholder
 var body: some View { placeholder() }
}
@main struct MarketReference: App {
 var body: some Scene { WindowGroup {
 VStack(spacing: 16) {
 MarketplaceItem(creatorName: "Vivian solo", isCreatorVerified: false, unlockSparkPrice: 30)
 MarketplaceItem(creatorName: "Vivian solo", isCreatorVerified: false, unlockText: "Unlocked", isAcquired: true)
 MarketplaceItem(mode: .edit, listingStatus: .DRAFT)
 Spacer()
 }.padding(.horizontal, 16).padding(.top, 20).background(Constants.Background).preferredColorScheme(.light)
 .task {
   let symbol = UIImage(systemName: "star.fill", withConfiguration: UIImage.SymbolConfiguration(pointSize: 9, weight: .semibold))!.withTintColor(UIColor(red:1,green:0.84,blue:0.2,alpha:1), renderingMode: .alwaysOriginal)
   let url = FileManager.default.urls(for: .documentDirectory, in: .userDomainMask)[0].appendingPathComponent("marketStar.png")
   try? symbol.pngData()?.write(to: url)
 }
 }}
}
''')
fonts = list((SOURCE / 'Resources/Fonts').glob('BeVietnamPro-*.ttf'))
for font in fonts: shutil.copy(font, APP / font.name)
assets = WORK / 'Assets.xcassets'; assets.mkdir()
for name in ['defaultTripPlaceholder', 'avatarPlaceholder', 'appLogoDark', 'rewardBolt']:
    original = next((SOURCE / 'Assets.xcassets').rglob(name + '.imageset'))
    shutil.copytree(original, assets / original.name)
plist = {'CFBundleIdentifier':'dev.oneplan.market-reference','CFBundleExecutable':'MarketReference','CFBundleName':'MarketReference','CFBundlePackageType':'APPL','CFBundleVersion':'1','CFBundleShortVersionString':'1.0','MinimumOSVersion':'17.0','LSRequiresIPhoneOS':True,'UILaunchScreen':{},'UIDeviceFamily':[1],'UIAppFonts':[p.name for p in fonts]}
(APP / 'Info.plist').write_bytes(plistlib.dumps(plist))
sdk = subprocess.check_output(['xcrun','--sdk','iphonesimulator','--show-sdk-path'],text=True).strip()
subprocess.run(['xcrun','actool',str(assets),'--compile',str(APP),'--platform','iphonesimulator','--minimum-deployment-target','17.0','--target-device','iphone'],check=True)
subprocess.run(['xcrun','swiftc','-sdk',sdk,'-target','arm64-apple-ios17.0-simulator','-parse-as-library',*[str(p) for p in WORK.glob('*.swift')],'-o',str(APP/'MarketReference')],check=True)
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
subprocess.run(['xcrun','simctl','launch','booted','dev.oneplan.market-reference'],check=True)
print(APP)
