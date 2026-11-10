// Packages the Linux release after `npm run desktop:release` in CI: signs the deb and rpm for the
// updater, builds the tarball from the deb's files and writes its PKGBUILD. Tauri marks the binary
// in each package with its type, which tells the updater how to install; the tarball's binary is
// unmarked, so the app only points to the new release there. See docs/BUILDING.md.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, existsSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const { version } = JSON.parse(readFileSync('package.json', 'utf8'));
const pkgrel = process.env.PKGREL || '1';
if (!/^[1-9]\d*$/.test(pkgrel)) throw new Error(`PKGREL must be a positive number, got ${pkgrel}`);
const bundle = 'target/release/bundle';

function find(dir, suffix) {
  const path = join(bundle, dir);
  const file = existsSync(path) && readdirSync(path).find((name) => name.endsWith(suffix));
  if (!file) throw new Error(`no ${suffix} in ${path}`);
  return join(path, file);
}

const deb = find('deb', '.deb');
for (const file of [deb, find('rpm', '.rpm')]) {
  if (existsSync(`${file}.sig`)) continue;
  execFileSync(
    'npm',
    ['exec', '-w', '@wizardchat/desktop', '--', 'tauri', 'signer', 'sign', resolve(file)],
    { stdio: 'inherit' }
  );
}

const marker = /__TAURI_BUNDLE_TYPE_VAR_(DEB|RPM|APP)/g;
const unmarked = '__TAURI_BUNDLE_TYPE_VAR_UNK';
const out = join(bundle, 'tarball');
const stage = join(out, 'stage');
rmSync(out, { recursive: true, force: true });
cpSync(join(deb.replace(/\.deb$/, ''), 'data'), stage, { recursive: true });
cpSync('LICENSE', join(stage, 'LICENSE'));
const bin = join(stage, 'usr/bin');
for (const name of readdirSync(bin)) {
  const file = join(bin, name);
  const text = readFileSync(file, 'latin1');
  const cleared = text.replace(marker, unmarked);
  if (cleared !== text) writeFileSync(file, cleared, 'latin1');
}

const tarball = join(out, `wizardchat-${version}-linux-x86_64.tar.gz`);
execFileSync('tar', ['-czf', tarball, '-C', stage, 'usr', 'LICENSE']);
rmSync(stage, { recursive: true });

const sha256 = createHash('sha256').update(readFileSync(tarball)).digest('hex');
const pkgbuild = readFileSync('packaging/aur/wizardchat-bin/PKGBUILD', 'utf8')
  .replace(/^#.*\n/, '')
  .replace(/^_version=.*$/m, `_version=${version}`)
  .replace(/^pkgver=.*$/m, `pkgver=${version.replaceAll('-', '_')}`)
  .replace(/^pkgrel=.*$/m, `pkgrel=${pkgrel}`)
  .replace(/^sha256sums=.*$/m, `sha256sums=('${sha256}')`);
writeFileSync(join(out, 'PKGBUILD'), pkgbuild);
console.log(`packaged ${tarball} and its PKGBUILD`);
