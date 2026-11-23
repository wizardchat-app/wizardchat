const files = import.meta.glob<Record<string, unknown>>(
  '../../../../packages/i18n/locales/*.json',
  {
    eager: true,
    import: 'default',
  }
);

export const LOCALES: Record<string, Record<string, unknown>> = Object.fromEntries(
  Object.entries(files).map(([path, strings]) => [
    path.slice(path.lastIndexOf('/') + 1, -'.json'.length),
    strings,
  ])
);

export const SUPPORTED_LANGUAGES: string[] = Object.keys(LOCALES).sort((a, b) =>
  a === 'en' ? -1 : b === 'en' ? 1 : a.localeCompare(b)
);

export function isSupportedLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.includes(code);
}

export function languageLabel(code: string): string {
  try {
    const name = new Intl.DisplayNames([code], { type: 'language' }).of(code) ?? code;
    return name.charAt(0).toLocaleUpperCase(code) + name.slice(1);
  } catch {
    return code;
  }
}

export function detectBrowserLanguage(): string {
  const candidates =
    navigator.languages && navigator.languages.length > 0
      ? navigator.languages
      : [navigator.language];
  const byLowercase = new Map(SUPPORTED_LANGUAGES.map((code) => [code.toLowerCase(), code]));
  for (const candidate of candidates) {
    if (!candidate) continue;
    const lower = candidate.toLowerCase();
    const match = byLowercase.get(lower) ?? byLowercase.get(lower.split('-')[0]);
    if (match) return match;
  }
  return 'en';
}
