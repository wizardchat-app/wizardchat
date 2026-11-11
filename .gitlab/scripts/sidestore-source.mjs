// Builds the SideStore / AltStore source (https://faq.altstore.io/developers/make-a-source) from
// every release with an unsigned .ipa, plus the one being published. The stable source lists stable
// releases only, the next source everything.
import { existsSync, readFileSync, statSync } from 'node:fs';

const RAW = 'https://gitlab.com/wizardchat/wizardchat/-/raw/main';
const TINT = '#5865f2';

function iosFacts() {
  const project = readFileSync('apps/ios/project.yml', 'utf8');
  const signing = readFileSync('apps/ios/Config/Signing.xcconfig', 'utf8');
  const entitlements = readFileSync('apps/ios/WizardChat/WizardChat.entitlements', 'utf8');
  const prefix = signing.match(/^WZ_BUNDLE_PREFIX\s*=\s*(\S+)/m)?.[1];
  const minOS = project.match(/deploymentTarget:\s*\n\s*iOS:\s*'([\d.]+)'/)?.[1];
  if (!prefix || !minOS) throw new Error('bundle prefix or iOS version not found');
  const privacy = Object.fromEntries(
    [...project.matchAll(/INFOPLIST_KEY_(NS\w+UsageDescription):\s*'([^']*)'/g)].map((m) => [
      m[1],
      m[2],
    ])
  );
  return {
    bundleIdentifier: `${prefix}.ios`,
    minOSVersion: minOS,
    appPermissions: {
      entitlements: [...entitlements.matchAll(/<key>([^<]+)<\/key>/g)].map((m) => m[1]),
      privacy,
    },
  };
}

// Same numbers as apps/ios/scripts/set-version.sh writes into the app
function versionOf(tag) {
  const version = tag.replace(/^v/, '');
  const release = version.replace(/-.*$/, '');
  const [major, minor, patch] = release.split('.').map(Number);
  const next = version.match(/-next\.(\d+)$/)?.[1];
  const build = major * 1000000 + minor * 10000 + patch * 100 + (next ? Number(next) : 99);
  return { version: release, buildVersion: String(build) };
}

function notesOf(tag) {
  const file = `whatsnew/${versionOf(tag).version}.md`;
  if (!existsSync(file)) return undefined;
  return readFileSync(file, 'utf8')
    .replace(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/, '')
    .trim();
}

async function sizeOf(url) {
  const response = await fetch(url, { method: 'HEAD', redirect: 'follow' }).catch(() => null);
  return Number(response?.headers.get('content-length')) || 0;
}

async function publishedIpas(api, project) {
  const response = await fetch(`${api}/projects/${project}/releases?per_page=100`);
  if (!response.ok) throw new Error(`listing releases: ${response.status}`);
  const releases = await response.json();
  return releases.flatMap((release) => {
    const link = release.assets?.links?.find((l) => l.name.endsWith('.ipa'));
    return link
      ? [
          {
            tag: release.tag_name,
            date: release.released_at,
            url: link.direct_asset_url ?? link.url,
          },
        ]
      : [];
  });
}

export async function sidestoreSources({ api, project, tag, ipaFile, ipaUrl }) {
  const facts = iosFacts();
  const current = {
    tag,
    date: new Date().toISOString(),
    url: ipaUrl,
    size: statSync(ipaFile).size,
  };
  const older = (await publishedIpas(api, project)).filter((release) => release.tag !== tag);
  const releases = [current, ...older].sort((a, b) => b.date.localeCompare(a.date));

  const versions = await Promise.all(
    releases.map(async (release) => ({
      tag: release.tag,
      entry: {
        ...versionOf(release.tag),
        date: release.date,
        localizedDescription: notesOf(release.tag),
        downloadURL: release.url,
        size: release.size ?? (await sizeOf(release.url)),
        minOSVersion: facts.minOSVersion,
      },
    }))
  );

  const source = (channel, list) => ({
    name: channel === 'next' ? 'WizardChat Next' : 'WizardChat',
    identifier: `${facts.bundleIdentifier}.source${channel === 'next' ? '.next' : ''}`,
    subtitle: 'A Matrix chat app for communities',
    description:
      'WizardChat for iOS, unsigned for sideloading. Push notifications, the share sheet and widgets need a paid developer account and may not work.',
    iconURL: `${RAW}/apps/desktop/src-tauri/icons/icon.png`,
    website: 'https://wizardchat.org',
    tintColor: TINT,
    apps: [
      {
        name: 'WizardChat',
        bundleIdentifier: facts.bundleIdentifier,
        developerName: 'WizardChat',
        subtitle: 'A Matrix chat app for communities',
        localizedDescription:
          'Chat, voice and video on Matrix: spaces, encrypted rooms, threads, themes and calls.',
        iconURL: `${RAW}/apps/desktop/src-tauri/icons/icon.png`,
        tintColor: TINT,
        category: 'social',
        screenshots: ['1-chat', '2-spaces', '3-encrypted', '4-themes', '5-voice-video'].map(
          (name) => `${RAW}/apps/ios/fastlane/screenshots/en-US/${name}.png`
        ),
        versions: list.map((version) => version.entry),
        appPermissions: facts.appPermissions,
      },
    ],
    news: [],
  });

  return {
    stable: source(
      'stable',
      versions.filter((v) => !v.tag.includes('-next'))
    ),
    next: source('next', versions),
  };
}
