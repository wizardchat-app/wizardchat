import type { WizardClient } from '@wizardchat/core';
import { DEFAULT_MAX_UPLOAD_BYTES } from '@/app/store/atoms/auth';

export async function fetchServerUploadLimit(client: WizardClient): Promise<number> {
  try {
    return (await client.serverCapabilities()).uploadSize ?? DEFAULT_MAX_UPLOAD_BYTES;
  } catch {
    return DEFAULT_MAX_UPLOAD_BYTES;
  }
}
