/**
 * Print the Google web client id each EAS profile bakes in. It MUST equal the target server's
 * `GOOGLE_CLIENT_ID` (the audience the server verifies) or Google sign-in fails with a clear
 * "audience" error. Usage: `pnpm check:google`
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

interface EasJson {
  build: Record<string, { env?: Record<string, string>; extends?: string }>;
}

const eas = JSON.parse(readFileSync(resolve(__dirname, '../eas.json'), 'utf8')) as EasJson;
const SERVER_HINT: Record<string, string> = {
  dev: 'server dev (.env on VPS /opt/oneplan/dev) GOOGLE_CLIENT_ID',
  prod: 'server prod (.env on VPS /opt/oneplan/prod) GOOGLE_CLIENT_ID',
};

function resolveEnv(profile: string, seen = new Set<string>()): Record<string, string> {
  const p = eas.build[profile];
  if (!p || seen.has(profile)) return {};
  seen.add(profile);
  const parent = p.extends ? resolveEnv(p.extends, seen) : {};
  return { ...parent, ...(p.env ?? {}) };
}

let ok = true;
for (const profile of Object.keys(eas.build)) {
  const env = resolveEnv(profile);
  const variant = env.APP_VARIANT;
  if (!variant) continue; // `base` and other abstract profiles
  const id = env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ?? '(missing)';
  if (id === '(missing)' || id.includes('TODO')) ok = false;
  const hint = SERVER_HINT[variant === 'local' ? 'dev' : variant] ?? '';
  console.log(`${profile.padEnd(22)} APP_VARIANT=${variant.padEnd(5)} web client id: ${id}`);
  if (hint) console.log(`${''.padEnd(22)} must equal ${hint}`);
}
if (!ok) {
  console.error('\nA profile is missing EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID.');
  process.exit(1);
}
