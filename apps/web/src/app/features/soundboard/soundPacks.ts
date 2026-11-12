import type { TFunction } from 'i18next';
import type { SoundPack, SoundboardSound, WizardClient } from '@wizardchat/core';
import { errorCode } from '@/core/client';
import { getErrorMessage } from '@/util/error';

const cache = new WeakMap<WizardClient, Map<string, SoundPack[]>>();

export function cachedSoundPacks(client: WizardClient, roomId: string): SoundPack[] | undefined {
  return cache.get(client)?.get(roomId);
}

export async function loadSoundPacks(client: WizardClient, roomId: string): Promise<SoundPack[]> {
  const packs = await client.soundboardPacks(roomId);
  let byRoom = cache.get(client);
  if (!byRoom) {
    byRoom = new Map();
    cache.set(client, byRoom);
  }
  byRoom.set(roomId, packs);
  return packs;
}

export function invalidateSoundPacks(client: WizardClient) {
  cache.delete(client);
}

export function soundPackTitle(t: TFunction, pack: SoundPack): string {
  if (pack.source === 'frequent') return t('call.soundboard.packs.frequent');
  if (pack.source === 'builtIn') return t('call.soundboard.packs.builtIn');
  if (pack.source === 'mine') return t('call.soundboard.packs.mine');
  return pack.name ?? '';
}

export function soundLabel(t: TFunction, sound: SoundboardSound): string {
  return (
    sound.body ?? t(`call.soundboard.sounds.${sound.shortcode}`, { defaultValue: sound.shortcode })
  );
}

export const SOUND_FILE_TYPES =
  'audio/mpeg,audio/mp4,audio/x-m4a,audio/aac,audio/wav,.mp3,.m4a,.aac,.wav';

function soundDuration(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const audio = new Audio();
    const done = (value: number | null) => {
      URL.revokeObjectURL(url);
      audio.removeAttribute('src');
      resolve(value);
    };
    audio.preload = 'metadata';
    audio.onloadedmetadata = () =>
      done(Number.isFinite(audio.duration) ? Math.round(audio.duration * 1000) : null);
    audio.onerror = () => done(null);
    audio.src = url;
  });
}

function mimetypeOf(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext === 'mp3' ? 'audio/mpeg' : ext === 'wav' ? 'audio/wav' : 'audio/mp4';
}

export function shortcodeFromName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .slice(0, 96) || 'sound'
  );
}

export async function uploadSoundFile(client: WizardClient, file: File): Promise<SoundboardSound> {
  const duration = (await soundDuration(file)) ?? 0;
  const data = new Uint8Array(await file.arrayBuffer());
  return client.uploadSound(data, mimetypeOf(file), duration);
}

export function soundErrorMessage(t: TFunction, error: unknown): string {
  if (errorCode(error) === 'invalidSound') {
    return t(`call.soundboard.errors.${getErrorMessage(error)}`, {
      defaultValue: t('call.soundboard.errors.unsupported'),
    });
  }
  return getErrorMessage(error);
}
