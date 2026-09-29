// SVG assets are imported as React components via react-native-svg-transformer
// (the iOS asset catalog ships tab/category/illustration icons as SVG).
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

const getExpoTransformOptions = config.transformer.getTransformOptions;
config.transformer = {
  ...config.transformer,
  babelTransformerPath: require.resolve('react-native-svg-transformer/expo'),
  // Inline requires: a module is evaluated on first use of one of its bindings instead of at
  // import time, so screens/sheets (and barrel re-exports) off the first frame cost nothing at
  // cold start. Expo's defaults are kept (`experimentalImportSupport: true`). Startup side
  // effects stay eager: bare `import '…'` (push/backgroundTask's `TaskManager.defineTask` +
  // notification handler) and the module-top calls in `app/_layout.tsx`.
  getTransformOptions: async (...args) => {
    const options = await getExpoTransformOptions(...args);
    return { ...options, transform: { ...options.transform, inlineRequires: true } };
  },
};
config.resolver = {
  ...config.resolver,
  assetExts: config.resolver.assetExts.filter((ext) => ext !== 'svg'),
  sourceExts: [...config.resolver.sourceExts, 'svg'],
  // @privy-io/js-sdk-core depends on `jose`, whose package.json `exports` map is broken for
  // Metro's default resolution — resolving it normally throws at bundle time. Force the
  // browser condition for that one module only (privy-io/expo-starter's metro.config.js).
  resolveRequest: (context, moduleName, platform) => {
    if (moduleName === 'jose') {
      return context.resolveRequest(
        { ...context, unstable_conditionNames: ['browser'] },
        moduleName,
        platform,
      );
    }
    return context.resolveRequest(context, moduleName, platform);
  },
};

module.exports = config;
