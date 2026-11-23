export function getInitialAndHue(name: string): { initial: string; hue: number } {
  const safeName = name || '?';
  const code = safeName.codePointAt(0) ?? 63;
  const hue = Math.round((code * 137.508) % 360);
  return { initial: Array.from(safeName)[0].toUpperCase(), hue };
}
