import { useEffect, useMemo } from 'react';
import { useAtomValue } from 'jotai';
import { uiZoomAtom } from '@/app/store/atoms';
import { DESKTOP_SIZES, UI_SCALE_VAR, type UiSizes } from '@/theme/uiDensity';

export function useUiDensitySizes(): UiSizes {
  const base = DESKTOP_SIZES;
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
  const zoom = useAtomValue(uiZoomAtom);

  useEffect(() => {
    document.documentElement.style.setProperty(UI_SCALE_VAR, String(zoom / 100));
  }, [zoom]);
}
