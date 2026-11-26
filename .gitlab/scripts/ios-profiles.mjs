// Finds or creates an App Store profile for each bundle ID with the distribution certificate of the given serial
// number, through the App Store Connect API, and writes them as <bundle ID>.mobileprovision into the output directory.
// Usage: node ios-profiles.mjs <key.p8> <certificate serial> <output directory> <bundle ID>...
import { createPrivateKey, sign } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [keyPath, serial, outDir, ...bundleIds] = process.argv.slice(2);
const api = 'https://api.appstoreconnect.apple.com/v1';

function token() {
  const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${encode({ alg: 'ES256', kid: process.env.APPLE_API_KEY, typ: 'JWT' })}.${encode(
    {
      iss: process.env.APPLE_API_ISSUER,
      iat: now,
      exp: now + 1200,
      aud: 'appstoreconnect-v1',
    }
  )}`;
  const key = createPrivateKey(readFileSync(keyPath));
  return `${unsigned}.${sign('sha256', Buffer.from(unsigned), { key, dsaEncoding: 'ieee-p1363' }).toString('base64url')}`;
}

const auth = token();
async function call(method, path, body) {
  const response = await fetch(`${api}${path}`, {
    method,
    headers: { Authorization: `Bearer ${auth}`, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  if (!response.ok)
    throw new Error(`${method} ${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

const certificates = (await call('GET', `/certificates?filter[serialNumber]=${serial}`)).data;
if (!certificates.length)
  throw new Error(`No certificate with serial number ${serial} in the developer account`);
const certificate = certificates[0];
mkdirSync(outDir, { recursive: true });

for (const identifier of bundleIds) {
  const bundle = (
    await call('GET', `/bundleIds?filter[identifier]=${identifier}&limit=200`)
  ).data.find((b) => b.attributes.identifier === identifier);
  if (!bundle) throw new Error(`No App ID ${identifier} in the developer account`);
  const name = `WizardChat CI ${identifier} ${serial.slice(-8)}`;
  const query = new URLSearchParams({
    'filter[name]': name,
    'filter[profileType]': 'IOS_APP_STORE',
    'filter[profileState]': 'ACTIVE',
  });
  let profile = (await call('GET', `/profiles?${query}`)).data[0];
  if (!profile) {
    profile = (
      await call('POST', '/profiles', {
        data: {
          type: 'profiles',
          attributes: { name, profileType: 'IOS_APP_STORE' },
          relationships: {
            bundleId: { data: { type: 'bundleIds', id: bundle.id } },
            certificates: { data: [{ type: 'certificates', id: certificate.id }] },
          },
        },
      })
    ).data;
    console.log(`Created profile ${name}`);
  } else {
    console.log(`Using profile ${name}`);
  }
  writeFileSync(
    join(outDir, `${identifier}.mobileprovision`),
    Buffer.from(profile.attributes.profileContent, 'base64')
  );
}
