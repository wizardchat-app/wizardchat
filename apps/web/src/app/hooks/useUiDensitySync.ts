import { useEffect, useMemo } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { touchUiAtom, uiZoomAtom } from '@/app/store/atoms';
import {
  DESKTOP_SIZES,
  TOUCH_SIZES,
  UI_SCALE_VAR,
  uiSizeVarName,
  type UiSizes,
} from '@/theme/uiDensity';
import { useMediaQuery } from './useMediaQuery';

export function useTouchUi(): boolean {
  return useAtomValue(touchUiAtom);
}

export function useUiDensitySizes(): UiSizes {
  const base = useTouchUi() ? TOUCH_SIZES : DESKTOP_SIZES;
  const scale = useAtomValue(uiZoomAtom) / 100;
  return useMemo(() => {
    const scaled = { ...base };
    for (const key of Object.keys(scaled) as (keyof UiSizes)[]) {
      if (key !== 'spaceGap') scaled[key] = Math.round(base[key] * scale);
    }
    return scaled;
  }, [base, scale]);
}

export function useUiDensitySync(): void {
  const touch = useMediaQuery('(max-width: 768px)');
  const setTouch = useSetAtom(touchUiAtom);
  const zoom = useAtomValue(uiZoomAtom);

  useEffect(() => {
    setTouch(touch);
    const root = document.documentElement;
    root.dataset.uiScale = touch ? 'touch' : 'desktop';
    for (const [key, value] of Object.entries(touch ? TOUCH_SIZES : DESKTOP_SIZES)) {
      root.style.setProperty(uiSizeVarName(key as keyof UiSizes), `${value}px`);
    }
  }, [touch, setTouch]);

  useEffect(() => {
    document.documentElement.style.setProperty(UI_SCALE_VAR, String(zoom / 100));
  }, [zoom]);
}
