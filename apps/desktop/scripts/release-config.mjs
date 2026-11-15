// Prepares a release build in CI: checks that the release tag matches the app version and puts the
// updater's public key (CI variable TAURI_UPDATER_PUBKEY) into tauri.release.conf.json, so the app
// can verify the updates it downloads. See docs/BUILDING.md.
import { readFileSync, writeFileSync } from 'node:fs';

const root = new URL('../../../', import.meta.url);
const configUrl = new URL('apps/desktop/src-tauri/tauri.release.conf.json', root);
const { version } = JSON.parse(readFileSync(new URL('package.json', root), 'utf8'));
const {
  RELEASE_TAG: tag,
  TAURI_UPDATER_PUBKEY: pubkey,
  APPLE_SIGNING_IDENTITY: identity,
} = process.env;

if (tag && tag !== `v${version}`) {
  throw new Error(`Tag ${tag} doesn't match the version in package.json (${version})`);
}
if (!pubkey) throw new Error('TAURI_UPDATER_PUBKEY is not set');

const config = JSON.parse(readFileSync(configUrl, 'utf8'));
config.plugins = { ...config.plugins, updater: { ...config.plugins?.updater, pubkey } };
if (identity) {
  config.bundle = {
    ...config.bundle,
    macOS: { ...config.bundle?.macOS, signingIdentity: identity },
  };
}
writeFileSync(configUrl, `${JSON.stringify(config, null, 2)}\n`);
console.log(
  `release build of ${version} with the updater key${identity ? ' and Developer ID signing' : ''}`
);
