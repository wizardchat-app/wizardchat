// Checks the shared translations (locales/*.json, i18next format, which the web imports as they are)
// and builds them for the native apps:
//   dist/apple/Localizable.xcstrings        string catalog for iOS
//   dist/android/values*/strings.xml        resources for Android
//   dist/android/values/languages.xml       the language list for Android's picker
//   dist/android/xml/locales_config.xml     the languages Android offers in its per-app setting
// Fails if a language is missing keys, has extra keys, or uses different {{placeholders}}.
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const SOURCE = 'en';
const PLURAL = /_(zero|one|two|few|many|other)$/;

const locales = Object.fromEntries(
  readdirSync(join(root, 'locales'))
    .filter((f) => f.endsWith('.json'))
    .map((f) => [
      f.replace('.json', ''),
      JSON.parse(readFileSync(join(root, 'locales', f), 'utf8')),
    ])
);
if (!locales[SOURCE]) throw new Error(`Missing source locale ${SOURCE}.json`);

const flatten = (node, prefix = '') =>
  Object.entries(node).flatMap(([k, v]) =>
    typeof v === 'string' ? [[prefix + k, v]] : flatten(v, `${prefix}${k}.`)
  );
const flat = Object.fromEntries(
  Object.entries(locales).map(([lang, tree]) => [lang, Object.fromEntries(flatten(tree))])
);
const placeholdersInOrder = (text) => [...text.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]);
const placeholders = (text) => placeholdersInOrder(text).sort();

const problems = [];
const sourceKeys = Object.keys(flat[SOURCE]);
for (const [lang, strings] of Object.entries(flat)) {
  if (lang === SOURCE) continue;
  for (const key of sourceKeys) {
    if (!(key in strings)) problems.push(`${lang}: missing "${key}"`);
    else if (placeholders(strings[key]).join() !== placeholders(flat[SOURCE][key]).join())
      problems.push(`${lang}: "${key}" uses different placeholders than ${SOURCE}`);
  }
  for (const key of Object.keys(strings)) {
    if (!(key in flat[SOURCE])) problems.push(`${lang}: extra "${key}" not in ${SOURCE}`);
  }
}
if (problems.length) throw new Error(`i18n check failed:\n  ${problems.join('\n  ')}`);

// Plural forms (key_one, key_other ...) are grouped under their base key
function grouped(strings) {
  const groups = new Map();
  for (const [key, value] of Object.entries(strings)) {
    const match = PLURAL.exec(key);
    const base = match ? key.slice(0, -match[0].length) : key;
    if (!groups.has(base)) groups.set(base, { plural: !!match, forms: {} });
    groups.get(base).forms[match ? match[1] : 'value'] = value;
  }
  return groups;
}

const languages = Object.keys(locales);
const keys = [...grouped(flat[SOURCE]).keys()];

// Apple (String Catalog)
// {{name}} becomes a positional %n$@ and {{count}} %n$lld, numbered in the order the English
// text uses them so every language takes the same arguments (Android does the same). Plurals
// that don't show the count can't be String Catalog plurals; they stay separate keys (key_one, key_other ...).
function appleFormat(text, order) {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const pos = order.indexOf(name) + 1;
    return name === 'count' ? `%${pos}$lld` : `%${pos}$@`;
  });
}
const sourceGroups = grouped(flat[SOURCE]);
const argumentOrder = (key) => [
  ...new Set(Object.values(sourceGroups.get(key).forms).flatMap(placeholdersInOrder)),
];
const catalog = { sourceLanguage: SOURCE, strings: {}, version: '1.0' };
for (const [lang, strings] of Object.entries(flat)) {
  for (const [key, { plural, forms }] of grouped(strings)) {
    const order = argumentOrder(key);
    const unit = (value) => ({
      stringUnit: { state: 'translated', value: appleFormat(value, order) },
    });
    if (plural && !order.includes('count')) {
      for (const [form, value] of Object.entries(forms)) {
        (catalog.strings[`${key}_${form}`] ??= { localizations: {} }).localizations[lang] =
          unit(value);
      }
      continue;
    }
    const entry = (catalog.strings[key] ??= { localizations: {} });
    entry.localizations[lang] = plural
      ? {
          variations: {
            plural: Object.fromEntries(Object.entries(forms).map(([f, v]) => [f, unit(v)])),
          },
        }
      : unit(forms.value);
  }
}

// Android
const androidName = (key) => key.replace(/[.-]/g, '_');
const androidEscape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/'/g, "\\'").replace(/"/g, '\\"');
function androidFormat(text, order) {
  return androidEscape(text).replace(/\{\{\s*(\w+)\s*\}\}/g, (_, name) => {
    const pos = order.indexOf(name) + 1;
    return name === 'count' ? `%${pos}$d` : `%${pos}$s`;
  });
}
function androidXml(strings) {
  const lines = [];
  for (const [key, { plural, forms }] of grouped(strings)) {
    const order = argumentOrder(key);
    if (plural) {
      lines.push(`    <plurals name="${androidName(key)}">`);
      for (const [form, value] of Object.entries(forms))
        if (form !== 'value')
          lines.push(`        <item quantity="${form}">${androidFormat(value, order)}</item>`);
      lines.push('    </plurals>');
      // A plain form next to the plural ones is its own string of the same name
      if (forms.value !== undefined)
        lines.push(
          `    <string name="${androidName(key)}">${androidFormat(forms.value, order)}</string>`
        );
    } else {
      lines.push(
        `    <string name="${androidName(key)}">${androidFormat(forms.value, order)}</string>`
      );
    }
  }
  return `<?xml version="1.0" encoding="utf-8"?>\n<!-- Generated by packages/i18n/scripts/build.mjs, do not edit -->\n<resources>\n${lines.join('\n')}\n</resources>\n`;
}

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'apple'), { recursive: true });
writeFileSync(
  join(dist, 'apple', 'Localizable.xcstrings'),
  `${JSON.stringify(catalog, null, 2)}\n`
);
const androidQualifier = (lang) => (lang.includes('-') ? `b+${lang.replace(/-/g, '+')}` : lang);
for (const lang of languages) {
  const dir = join(
    dist,
    'android',
    lang === SOURCE ? 'values' : `values-${androidQualifier(lang)}`
  );
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'strings.xml'), androidXml(flat[lang]));
}
const ordered = [SOURCE, ...languages.filter((l) => l !== SOURCE).sort()];
const generated = '<!-- Generated by packages/i18n/scripts/build.mjs, do not edit -->';
writeFileSync(
  join(dist, 'android', 'values', 'languages.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n${generated}\n<resources>\n    <string-array name="app_languages" translatable="false">\n${ordered.map((l) => `        <item>${l}</item>`).join('\n')}\n    </string-array>\n</resources>\n`
);
mkdirSync(join(dist, 'android', 'xml'), { recursive: true });
writeFileSync(
  join(dist, 'android', 'xml', 'locales_config.xml'),
  `<?xml version="1.0" encoding="utf-8"?>\n${generated}\n<locale-config xmlns:android="http://schemas.android.com/apk/res/android">\n${ordered.map((l) => `    <locale android:name="${l}" />`).join('\n')}\n</locale-config>\n`
);
console.log(`i18n: ${keys.length} keys in ${languages.join(', ')}, all languages complete`);
