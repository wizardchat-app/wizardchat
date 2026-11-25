import { IS_MAC } from '@/app/util/platform';

export type Modifier = 'Ctrl' | 'Alt' | 'Shift' | 'Meta';

export interface KeyCombo {
  modifiers: Modifier[];
  code: string;
}

const MODIFIERS: Modifier[] = ['Ctrl', 'Alt', 'Shift', 'Meta'];

const MODIFIER_CODES: Record<string, Modifier> = {
  ControlLeft: 'Ctrl',
  ControlRight: 'Ctrl',
  AltLeft: 'Alt',
  AltRight: 'Alt',
  ShiftLeft: 'Shift',
  ShiftRight: 'Shift',
  MetaLeft: 'Meta',
  MetaRight: 'Meta',
};

export function modifierOfCode(code: string): Modifier | null {
  return MODIFIER_CODES[code] ?? null;
}

export function parseCombo(value: string | undefined | null): KeyCombo | null {
  if (!value) return null;
  const parts = value.split('+');
  const code = parts[parts.length - 1];
  if (!code) return null;
  const modifiers = parts
    .slice(0, -1)
    .filter((part): part is Modifier => (MODIFIERS as string[]).includes(part));
  return { modifiers, code };
}

export function serializeCombo(combo: KeyCombo): string {
  const modifiers = MODIFIERS.filter((m) => combo.modifiers.includes(m));
  return [...modifiers, combo.code].join('+');
}

function heldModifiers(e: KeyboardEvent): Modifier[] {
  const held: Modifier[] = [];
  if (e.ctrlKey) held.push('Ctrl');
  if (e.altKey) held.push('Alt');
  if (e.shiftKey) held.push('Shift');
  if (e.metaKey) held.push('Meta');
  return held;
}

export function matchesComboDown(e: KeyboardEvent, combo: KeyCombo | null): boolean {
  if (!combo || e.code !== combo.code) return false;
  const own = modifierOfCode(combo.code);
  const held = heldModifiers(e).filter((m) => m !== own);
  return held.length === combo.modifiers.length && combo.modifiers.every((m) => held.includes(m));
}

export function isComboKeyUp(e: KeyboardEvent, combo: KeyCombo | null): boolean {
  if (!combo) return false;
  if (e.code === combo.code) return true;
  const modifier = modifierOfCode(e.code);
  return !!modifier && combo.modifiers.includes(modifier);
}

const MODIFIER_LABELS: Record<Modifier, string> = IS_MAC
  ? { Ctrl: '⌃', Alt: '⌥', Shift: '⇧', Meta: '⌘' }
  : { Ctrl: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Win' };

const NAMED_KEYS: Record<string, string> = {
  Backquote: '`',
  Minus: '-',
  Equal: '=',
  BracketLeft: '[',
  BracketRight: ']',
  Backslash: '\\',
  Semicolon: ';',
  Quote: "'",
  Comma: ',',
  Period: '.',
  Slash: '/',
  Escape: 'Esc',
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
};

export function formatKeyCode(code: string): string {
  const modifier = modifierOfCode(code);
  if (modifier) {
    const side = code.endsWith('Right') ? ' Right' : '';
    return `${MODIFIER_LABELS[modifier]}${side}`;
  }
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  return NAMED_KEYS[code] ?? code;
}

export function comboKeys(combo: KeyCombo): string[] {
  const modifiers = MODIFIERS.filter((m) => combo.modifiers.includes(m)).map(
    (m) => MODIFIER_LABELS[m]
  );
  return [...modifiers, formatKeyCode(combo.code)];
}

export function heldModifierKeys(e: KeyboardEvent): string[] {
  return heldModifiers(e).map((m) => MODIFIER_LABELS[m]);
}

export const keybindCapture = { active: false };
