// Writes the release's version (RELEASE_VERSION from the release-version job) into package.json, where
// every app reads its version from.
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.env.RELEASE_VERSION;
if (!version) throw new Error('RELEASE_VERSION is not set; does this job need release-version?');
const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
pkg.version = version;
writeFileSync('package.json', `${JSON.stringify(pkg, null, 2)}\n`);
console.log(`building ${version}`);
