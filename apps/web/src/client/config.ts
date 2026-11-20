import { normalizeUrl } from '@/client/initMatrix';

export interface ClientConfig {
  homeserverList: string[];
  defaultHomeserver: number | null;
  allowCustomHomeservers: boolean;
  gifApiUrl: string;
}

const DEFAULTS: ClientConfig = {
  homeserverList: ['matrix.org', 'mozilla.org', 'unredacted.org'],
  defaultHomeserver: 0,
  allowCustomHomeservers: true,
  gifApiUrl: import.meta.env.GIF_API_URL,
};

let config: ClientConfig = DEFAULTS;

export const clientConfig = (): ClientConfig => config;

const isString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim() !== '';

function parse(raw: Record<string, unknown>): ClientConfig {
  const list = Array.isArray(raw.homeserverList)
    ? raw.homeserverList.filter(isString).map((s) => s.trim())
    : DEFAULTS.homeserverList;
  const allowCustom =
    list.length === 0 ||
    (typeof raw.allowCustomHomeservers === 'boolean'
      ? raw.allowCustomHomeservers
      : DEFAULTS.allowCustomHomeservers);
  const index = raw.defaultHomeserver;
  let defaultHomeserver: number | null = list.length > 0 ? 0 : null;
  if (Number.isInteger(index) && (index as number) >= 0 && (index as number) < list.length)
    defaultHomeserver = index as number;
  else if (index === null && allowCustom) defaultHomeserver = null;
  return {
    homeserverList: list,
    defaultHomeserver,
    allowCustomHomeservers: allowCustom,
    gifApiUrl: isString(raw.gifApiUrl)
      ? raw.gifApiUrl.trim().replace(/\/+$/, '')
      : DEFAULTS.gifApiUrl,
  };
}

export async function loadClientConfig(): Promise<void> {
  try {
    const res = await fetch('/config.json', {
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return;
    const raw: unknown = await res.json();
    if (raw && typeof raw === 'object' && !Array.isArray(raw))
      config = parse(raw as Record<string, unknown>);
    else console.warn('config.json is not a JSON object, using the defaults');
  } catch (error) {
    console.warn('Could not read config.json, using the defaults', error);
  }
}

export interface ServerOption {
  label: string;
  value: string;
}

export const CUSTOM_SERVER = 'custom';

export function homeserverOptions(customLabel: string): ServerOption[] {
  const { homeserverList, allowCustomHomeservers } = config;
  const options = homeserverList.map((server) => ({
    label: server.replace(/^https?:\/\//, '').replace(/\/+$/, ''),
    value: normalizeUrl(server),
  }));
  return allowCustomHomeservers
    ? [...options, { label: customLabel, value: CUSTOM_SERVER }]
    : options;
}

export function initialHomeserver(fromUrl?: string): { select: string; customUrl: string } {
  const { homeserverList, defaultHomeserver, allowCustomHomeservers } = config;
  const servers = homeserverList.map(normalizeUrl);
  if (fromUrl) {
    const match = servers.find((s) => s === normalizeUrl(fromUrl));
    if (match) return { select: match, customUrl: '' };
    if (allowCustomHomeservers) return { select: CUSTOM_SERVER, customUrl: fromUrl };
  }
  if (defaultHomeserver === null) return { select: CUSTOM_SERVER, customUrl: '' };
  return { select: servers[defaultHomeserver], customUrl: '' };
}
