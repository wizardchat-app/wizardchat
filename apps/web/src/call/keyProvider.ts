import { BaseKeyProvider } from 'livekit-client';

/** Media keys come from the core (exchanged over encrypted to-device messages) */
export class MatrixKeyProvider extends BaseKeyProvider {
  onKey?: (identity: string, index: number) => void;

  constructor() {
    super({ ratchetWindowSize: 10, keyringSize: 256 });
  }

  async setKey(identity: string, index: number, keyBase64: string) {
    const raw = Uint8Array.from(atob(keyBase64), (c) => c.charCodeAt(0));
    const material = await crypto.subtle.importKey('raw', raw, 'HKDF', false, [
      'deriveBits',
      'deriveKey',
    ]);
    this.onSetEncryptionKey(material, identity, index);
    this.onKey?.(identity, index);
  }
}
