import { getConfig } from 'expo/config';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(__dirname, '../..');
const { exp } = getConfig(root);
const errors: string[] = [];
const check = (condition: unknown, message: string) => {
  if (!condition) errors.push(message);
};
check(exp.extra?.variant === 'prod', 'APP_VARIANT must be prod');
check(exp.extra?.apiUrl === 'https://api.oneplan.space', 'API must be production');
check(exp.ios?.bundleIdentifier === 'lumilabs.oneplan', 'iOS identity changed');
check(exp.android?.package === 'com.oneplan.android', 'Android identity changed');
check(
  exp.ios?.version === '2.0.0' && exp.android?.version === '2.0.0',
  'Unexpected platform release versions',
);
check(
  exp.ios?.entitlements?.['aps-environment'] === 'production',
  'Production APNs entitlement missing',
);
for (const host of ['api.oneplan.space', 'op.oneplan.space']) {
  check(
    exp.ios?.associatedDomains?.includes(`applinks:${host}`),
    `Missing associated domain: ${host}`,
  );
  for (const prefix of ['/join', '/friend', '/listing']) {
    check(
      exp.android?.intentFilters?.some(
        (filter) =>
          filter.autoVerify &&
          Array.isArray(filter.data) &&
          filter.data.some((data) => data.host === host && data.pathPrefix === prefix),
      ),
      `Missing Android app link: ${host}${prefix}`,
    );
  }
}
const scheme = exp.scheme;
check(Array.isArray(scheme) && scheme.includes('oneplan'), 'App URL scheme missing');
check(exp.extra?.eas?.projectId === '76fe3987-e628-4a77-97e8-78c4f93a343c', 'EAS project changed');
for (const module of ['legacy-session', 'parity-ui']) {
  check(
    existsSync(resolve(root, 'modules', module, 'expo-module.config.json')),
    `Missing native module: ${module}`,
  );
}
// Run --credentials inside the production EAS environment. Only variable NAMES
// are printed; never dump resolved app config or credential contents into CI logs.
if (process.argv.includes('--credentials')) {
  for (const key of [
    'FOURSQUARE_API_KEY',
    'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID',
    'EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID',
  ]) {
    check(process.env[key] && process.env[key] !== 'unset', `Missing production variable: ${key}`);
  }
  // Optional: without it Instagram Stories sharing falls back to the system share sheet.
  if (!process.env.FACEBOOK_APP_ID || process.env.FACEBOOK_APP_ID === 'unset') {
    console.warn('FACEBOOK_APP_ID not set: Instagram Stories share falls back to the share sheet');
  }
  if (process.env.EAS_BUILD_PLATFORM === 'android') {
    check(
      process.env.GOOGLE_MAPS_ANDROID_API_KEY,
      'Missing production variable: GOOGLE_MAPS_ANDROID_API_KEY',
    );
    const file = exp.android?.googleServicesFile;
    if (!file || !existsSync(resolve(root, file))) errors.push('Production Firebase file missing');
    else {
      const google = JSON.parse(readFileSync(resolve(root, file), 'utf8')) as {
        client?: { client_info?: { android_client_info?: { package_name?: string } } }[];
      };
      check(
        google.client?.some(
          (client) =>
            client.client_info?.android_client_info?.package_name === exp.android?.package,
        ),
        'Firebase package does not match production',
      );
    }
  }
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else
  console.log(
    'Production identity, versions, native adapters and link configuration verified. Store counters/signing and device acceptance are separate gates.',
  );
