import { useEffect } from 'react';
import { useApplyTheme } from '@/theme/useApplyTheme';
import { emit } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { SHARE_PICKER_EVENT } from '@/bridge/screenCapture';
import { useSourcePicker } from './useSourcePicker';
import * as css from './DesktopSourcePicker.css';

export function SharePickerWindow() {
  const picker = useSourcePicker((choice) => {
    void emit(SHARE_PICKER_EVENT, choice).finally(() => void getCurrentWindow().close());
  });
  const { load, finish } = picker;

  useApplyTheme();

  useEffect(() => load(), [load]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') finish(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className={css.window}>
      <div className={css.windowBody}>{picker.body}</div>
      <div className={css.windowFooter}>{picker.footer}</div>
    </div>
  );
}
