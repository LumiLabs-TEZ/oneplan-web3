/**
 * Local-variant only: attaches a StoreKit configuration file to the generated Xcode scheme's Run
 * action, mirroring the native `OnePlan-Local` scheme. `local.lumilabs.oneplan` has no products in
 * App Store Connect, so without this `fetchProducts` returns nothing and the paywall is empty.
 *
 * Copies the file into `ios/<ProjectName>/` and adds a `StoreKitConfigurationFileReference` to
 * `<ProjectName>.xcscheme`. Xcode resolves the reference relative to the project's
 * `xcshareddata` folder, hence the `../../` prefix.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

function withStoreKitConfig(config, { file }) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const { projectRoot, platformProjectRoot, projectName } = cfg.modRequest;
      const fileName = path.basename(file);
      fs.copyFileSync(
        path.resolve(projectRoot, file),
        path.join(platformProjectRoot, projectName, fileName),
      );

      const schemePath = path.join(
        platformProjectRoot,
        `${projectName}.xcodeproj`,
        'xcshareddata',
        'xcschemes',
        `${projectName}.xcscheme`,
      );
      const scheme = fs.readFileSync(schemePath, 'utf8');
      if (!scheme.includes('StoreKitConfigurationFileReference')) {
        const reference = [
          '      <StoreKitConfigurationFileReference',
          `         identifier = "../../${projectName}/${fileName}">`,
          '      </StoreKitConfigurationFileReference>',
          '   </LaunchAction>',
        ].join('\n');
        if (!scheme.includes('</LaunchAction>')) {
          throw new Error(`withStoreKitConfig: no </LaunchAction> in ${schemePath}`);
        }
        fs.writeFileSync(schemePath, scheme.replace('   </LaunchAction>', reference));
      }
      return cfg;
    },
  ]);
}

module.exports = withStoreKitConfig;
