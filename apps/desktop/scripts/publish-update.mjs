// Publishes a desktop release from the CI build artifacts: uploads the installers and update bundles
// to the GitLab package registry (`wizardchat-desktop/<tag>/`) and writes the update feed the apps
// check (`wizardchat-desktop/<channel>/latest.json`), stable releases to stable and next releases to
// next. The installers are listed in desktop-assets.json for the release page.
// The Linux tarball's PKGBUILD goes next to the feed (`<channel>/PKGBUILD`) for Arch users.
// The Android APK is uploaded and listed with the installers for people who don't use Google Play,
// and the unsigned iOS IPA for sideloading.
// See docs/BUILDING.md.
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const {
  CI_API_V4_URL: api,
  CI_PROJECT_ID: project,
  CI_JOB_TOKEN: token,
  CI_COMMIT_TAG: tag,
  DRY_RUN: dryRun,
} = process.env;
if (!api || !project || !token || !tag) throw new Error('run this in a CI tag pipeline');

const version = tag.replace(/^v/, '');
const bundle = 'target/release/bundle';
const registry = `${api}/projects/${project}/packages/generic/wizardchat-desktop`;

const macBundle = (arch) => `target/${arch}-apple-darwin/release/bundle`;
const windowsBundle = 'target/x86_64-pc-windows-msvc/release/bundle';

function find(dir, suffix, root = bundle) {
  const path = join(root, dir);
  const file = existsSync(path) && readdirSync(path).find((name) => name.endsWith(suffix));
  if (!file) throw new Error(`no ${suffix} in ${path}`);
  return join(path, file);
}

async function upload(file, folder = tag, name = basename(file)) {
  const url = `${registry}/${folder}/${encodeURIComponent(name)}`;
  if (dryRun === 'true') {
    console.log(`DRY RUN: would upload ${folder}/${name}`);
    return url;
  }
  const response = await fetch(url, {
    method: 'PUT',
    headers: { 'JOB-TOKEN': token },
    body: readFileSync(file),
  });
  if (!response.ok)
    throw new Error(`uploading ${name}: ${response.status} ${await response.text()}`);
  console.log(`uploaded ${folder}/${name}`);
  return url;
}

// Each platform's update bundle with the signature the build wrote next to it
const updates = {
  'darwin-aarch64': find('macos', '.app.tar.gz', macBundle('aarch64')),
  'darwin-x86_64': find('macos', '.app.tar.gz', macBundle('x86_64')),
  'linux-x86_64': find('appimage', '.AppImage'),
  'linux-x86_64-deb': find('deb', '.deb'),
  'linux-x86_64-rpm': find('rpm', '.rpm'),
  'windows-x86_64': find('nsis', '-setup.exe', windowsBundle),
};
const installers = [
  find('dmg', '.dmg', macBundle('aarch64')),
  find('dmg', '.dmg', macBundle('x86_64')),
  find('tarball', '.tar.gz'),
  find('arch', '.pkg.tar.zst'),
  find('android', '.apk', 'target'),
  find('ios', '.ipa', 'target'),
];

const platforms = {};
for (const [platform, file] of Object.entries(updates)) {
  // Both Macs' bundles are called WizardChat.app.tar.gz
  const name = platform.startsWith('darwin-')
    ? `WizardChat_${version}_${platform.slice('darwin-'.length)}.app.tar.gz`
    : basename(file);
  platforms[platform] = {
    url: await upload(file, tag, name),
    signature: readFileSync(`${file}.sig`, 'utf8').trim(),
  };
  await upload(`${file}.sig`, tag, `${name}.sig`);
}
for (const file of installers) await upload(file);
const downloads = [
  ...installers,
  updates['windows-x86_64'],
  updates['linux-x86_64'],
  updates['linux-x86_64-deb'],
  updates['linux-x86_64-rpm'],
];
const assets = downloads.map((file) => ({
  name: basename(file),
  url: `${registry}/${tag}/${encodeURIComponent(basename(file))}`,
  link_type: 'package',
}));
writeFileSync('desktop-assets.json', JSON.stringify(assets));

const notesFile = `whatsnew/${version.replace(/-.*$/, '')}.md`;
const feed = JSON.stringify({
  version,
  notes: existsSync(notesFile)
    ? readFileSync(notesFile, 'utf8').replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    : '',
  pub_date: new Date().toISOString(),
  platforms,
});
const feedFile = join(bundle, 'latest.json');
writeFileSync(feedFile, feed);
const channel = version.includes('-next') ? 'next' : 'stable';
await upload(feedFile, channel, 'latest.json');

const pkgbuildFile = join(bundle, 'tarball/PKGBUILD');
await upload(pkgbuildFile);
await upload(pkgbuildFile, channel, 'PKGBUILD');
