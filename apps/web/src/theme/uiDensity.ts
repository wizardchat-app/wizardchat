export interface UiSizes {
  roomRow: number;
  roomAvatar: number;
  categoryHeader: number;
  memberRow: number;
  roleHeader: number;
  spaceGap: number;
}

export const DESKTOP_SIZES: UiSizes = {
  roomRow: 40,
  roomAvatar: 32,
  categoryHeader: 26,
  memberRow: 38,
  roleHeader: 30,
  spaceGap: 6,
};

export const TOUCH_SIZES: UiSizes = {
  roomRow: 72,
  roomAvatar: 48,
  categoryHeader: 44,
  memberRow: 54,
  roleHeader: 42,
  spaceGap: 16,
};

export const UI_ZOOM_LEVELS = [80, 90, 100, 110, 125, 150];
export const DEFAULT_UI_ZOOM = 100;

export function uiSizeVarName(key: keyof UiSizes): string {
  return `--wz-ui-${key}`;
}

export function uiSize(key: keyof UiSizes): string {
  return `var(${uiSizeVarName(key)}, ${DESKTOP_SIZES[key]}px)`;
}

export const UI_SCALE_VAR = '--wz-ui-scale';

export const uiZoom = `var(${UI_SCALE_VAR}, 1)`;

export const TOUCH_UI = 'html[data-ui-scale="touch"]';

export const TOUCH_FIRST_QUERY = '(hover: none) and (pointer: coarse)';
