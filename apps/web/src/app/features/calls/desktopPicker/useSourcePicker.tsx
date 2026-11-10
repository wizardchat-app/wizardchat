import { useCallback, useState } from 'react';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Button } from '@/app/components/Button';
import { Toggle } from '@/app/components/Toggle';
import { shareScreenAudioAtom } from '@/app/store/atoms/call';
import * as css from './DesktopSourcePicker.css';

type Tab = 'screen' | 'window';

export type SourceChoice = { id: string; name: string; audio: boolean } | null;

export function useSourcePicker(onFinish: (choice: SourceChoice) => void) {
  const { t } = useTranslation();
  const api = window.desktopAPI;
  const [sources, setSources] = useState<DesktopSource[]>([]);
  const [tab, setTab] = useState<Tab>('screen');
  const [selected, setSelected] = useState<string | null>(null);
  const [shareAudio, setShareAudio] = useAtom(shareScreenAudioAtom);
  const [audioSupported, setAudioSupported] = useState(true);

  const load = useCallback(() => {
    setSelected(null);
    setTab('screen');
    void api?.screenShareAudioSupported?.().then(setAudioSupported);
    void api
      ?.getDesktopSources?.({
        types: ['screen', 'window'],
        thumbnailSize: { width: 320, height: 180 },
      })
      .then(setSources);
  }, [api]);

  const finish = (source: DesktopSource | null) =>
    onFinish(
      source ? { id: source.id, name: source.name, audio: shareAudio && audioSupported } : null
    );

  const visible = sources.filter((s) => s.id.startsWith(`${tab}:`));
  const chosen = sources.find((s) => s.id === selected) ?? null;

  const body = (
    <>
      <div className={css.tabs} role="tablist">
        {(['screen', 'window'] as const).map((value) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={tab === value}
            className={tab === value ? css.tabActive : css.tab}
            onClick={() => setTab(value)}
          >
            {value === 'screen' ? t('desktopPicker.screens') : t('desktopPicker.windows')}
          </button>
        ))}
      </div>
      <div className={css.grid}>
        {visible.map((source) => (
          <button
            key={source.id}
            type="button"
            className={source.id === selected ? css.sourceSelected : css.source}
            onClick={() => setSelected(source.id)}
            onDoubleClick={() => finish(source)}
          >
            <img className={css.thumbnail} src={source.thumbnail.dataUrl} alt="" />
            <span className={css.sourceName}>
              {source.appIcon && <img className={css.appIcon} src={source.appIcon} alt="" />}
              <span className={css.sourceNameText}>{source.name}</span>
            </span>
          </button>
        ))}
      </div>
    </>
  );

  const footer = (
    <>
      {audioSupported && (
        <label className={css.audioToggle}>
          <Toggle
            size="sm"
            checked={shareAudio}
            onChange={setShareAudio}
            ariaLabel={t('desktopPicker.shareAudio')}
          />
          {t('desktopPicker.shareAudio')}
        </label>
      )}
      <Button variant="secondary" onClick={() => finish(null)}>
        {t('common.cancel')}
      </Button>
      <Button variant="primary" disabled={!chosen} onClick={() => finish(chosen)}>
        {t('desktopPicker.share')}
      </Button>
    </>
  );

  return { load, finish, body, footer };
}
