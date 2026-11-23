import { WizardClient } from '@wizardchat/core';

const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz#$%*+,-.:;=?@[]^_{|}~';
const SIZE = 32;

const cache = new Map<string, string | null>();

function decode83(str: string): number {
  let value = 0;
  for (const c of str) {
    const digit = CHARS.indexOf(c);
    if (digit < 0) throw new Error('invalid blurhash');
    value = value * 83 + digit;
  }
  return value;
}

function srgbToLinear(value: number): number {
  const v = value / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(value: number): number {
  const v = Math.max(0, Math.min(1, value));
  return Math.round(v <= 0.0031308 ? v * 12.92 * 255 : (1.055 * v ** (1 / 2.4) - 0.055) * 255);
}

function signPow(value: number, exp: number): number {
  return Math.sign(value) * Math.abs(value) ** exp;
}

function decodePixels(hash: string): Uint8ClampedArray<ArrayBuffer> {
  const sizeFlag = decode83(hash[0]);
  const numX = (sizeFlag % 9) + 1;
  const numY = Math.floor(sizeFlag / 9) + 1;
  if (hash.length !== 4 + 2 * numX * numY) throw new Error('invalid blurhash');
  const maxValue = (decode83(hash[1]) + 1) / 166;

  const colors: [number, number, number][] = [];
  const dc = decode83(hash.slice(2, 6));
  colors.push([srgbToLinear(dc >> 16), srgbToLinear((dc >> 8) & 255), srgbToLinear(dc & 255)]);
  for (let i = 1; i < numX * numY; i++) {
    const ac = decode83(hash.slice(4 + i * 2, 6 + i * 2));
    const q = (v: number) => signPow((v - 9) / 9, 2) * maxValue;
    colors.push([q(Math.floor(ac / 361)), q(Math.floor(ac / 19) % 19), q(ac % 19)]);
  }

  const pixels = new Uint8ClampedArray(SIZE * SIZE * 4);
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      for (let j = 0; j < numY; j++) {
        for (let i = 0; i < numX; i++) {
          const basis = Math.cos((Math.PI * x * i) / SIZE) * Math.cos((Math.PI * y * j) / SIZE);
          const color = colors[i + j * numX];
          r += color[0] * basis;
          g += color[1] * basis;
          b += color[2] * basis;
        }
      }
      const p = 4 * (x + y * SIZE);
      pixels[p] = linearToSrgb(r);
      pixels[p + 1] = linearToSrgb(g);
      pixels[p + 2] = linearToSrgb(b);
      pixels[p + 3] = 255;
    }
  }
  return pixels;
}

export function blurhashDataUrl(hash: string | null | undefined): string | null {
  if (!hash || hash.length < 6) return null;
  const hit = cache.get(hash);
  if (hit !== undefined) return hit;
  let url: string | null = null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = SIZE;
    canvas.height = SIZE;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.putImageData(new ImageData(decodePixels(hash), SIZE, SIZE), 0, 0);
      url = canvas.toDataURL();
    }
  } catch {
    url = null;
  }
  if (cache.size > 500) cache.clear();
  cache.set(hash, url);
  return url;
}

const ENCODE_SIZE = 32;

export async function encodeBlurhash(image: Blob): Promise<string | null> {
  try {
    if (typeof createImageBitmap !== 'function') return null;
    const bitmap = await createImageBitmap(image);
    const scale = ENCODE_SIZE / Math.max(bitmap.width, bitmap.height);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      bitmap.close();
      return null;
    }
    ctx.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    const { data } = ctx.getImageData(0, 0, width, height);
    return await WizardClient.encodeBlurhash(new Uint8Array(data.buffer), width, height);
  } catch {
    return null;
  }
}
