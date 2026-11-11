import { useEffect, useRef, useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { XIcon, SpinnerGapIcon } from '@phosphor-icons/react';
import { useAtom, useAtomValue } from 'jotai';
import {
  ClientWidgetApi,
  WidgetDriver,
  Widget,
  WidgetApiFromWidgetAction,
} from 'matrix-widget-api';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { activeCustomThemeAtom, stickerPickerAtom, themeAtom } from '@/app/store/atoms';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import {
  sendRawEvent,
  type ReplyTarget,
} from '@/app/features/timeline/composer/sendMessageContent';
import { useComposerTimeline } from '@/app/features/timeline/composer/composerTimeline';
import { LIGHT_THEMES } from '@/theme/themeTokens';
import * as css from './StickerPicker.css';

interface Props {
  client: MatrixClient;
  roomId: string;
  threadId?: string | null;
  widgetUrl: string;
  widgetName?: string;
  replyTo?: ReplyTarget | null;
  onReplySent?: () => void;
}

function getThemedUrl(base: string, light: boolean): string {
  const sep = base.includes('?') ? '&' : '?';
  const theme = light ? 'light' : 'dark';
  if (base.includes('theme=')) return base;
  return `${base}${sep}theme=${theme}`;
}

// Minimal WidgetDriver subclass that grants sticker-sending capability
class StickerWidgetDriver extends WidgetDriver {
  async validateCapabilities() {
    return new Set<string>(['m.sticker']);
  }
}

export function StickerPicker({
  client,
  roomId,
  threadId,
  widgetUrl,
  widgetName,
  replyTo,
  onReplySent,
}: Props) {
  const { t } = useTranslation();
  const [picker, setPicker] = useAtom(stickerPickerAtom);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const widgetApiRef = useRef<ClientWidgetApi | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [loading, setLoading] = useState(true);
  const toast = useToast();
  const getTimeline = useComposerTimeline(client, roomId, threadId);
  const currentTheme = useAtomValue(themeAtom);
  const customTheme = useAtomValue(activeCustomThemeAtom);
  const lightTheme = customTheme ? customTheme.mode === 'light' : LIGHT_THEMES.has(currentTheme);

  const close = useCallback(() => setPicker(false), [setPicker]);

  const setupWidgetApi = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const themedUrl = getThemedUrl(widgetUrl, lightTheme);
    const widget = new Widget({
      id: 'stickerpicker',
      creatorUserId: client.userId() ?? '@wizard:localhost',
      type: 'm.stickerpicker',
      url: themedUrl,
    });
    const driver = new StickerWidgetDriver();

    try {
      widgetApiRef.current?.stop?.();
      widgetApiRef.current = new ClientWidgetApi(widget, iframe, driver);
      widgetApiRef.current.on('ready', () => {});
    } catch {
      // Fallback: rely on raw postMessage listener below
    }

    setLoading(false);
  }, [widgetUrl, client, lightTheme]);

  useEffect(() => {
    if (!picker) return;

    const handleMessage = async (ev: MessageEvent) => {
      const iframe = iframeRef.current;
      if (!iframe || ev.source !== iframe.contentWindow) return;
      const data = ev.data;
      if (!data || data.api !== 'fromWidget') return;
      if (data.action !== 'm.sticker' && data.action !== WidgetApiFromWidgetAction.SendSticker)
        return;

      const stickerData = data.data;
      if (!stickerData) return;

      try {
        const content = stickerData.content ?? stickerData;
        const name: string = stickerData.name ?? content.body ?? 'Sticker';
        const url: string = content.url;
        const info = content.info ?? {};
        if (!url) return;

        const mimetype: string = info.mimetype ?? 'image/png';

        // send all content from stickerpicker as m.sticker
        const sentInfo: Record<string, unknown> = {
          w: info.w ?? 200,
          h: info.h ?? 200,
          mimetype,
          size: info.size ?? 0,
        };
        if (typeof info.is_animated === 'boolean') sentInfo.is_animated = info.is_animated;
        const stickerContent: Record<string, unknown> = {
          body: name,
          url,
          info: sentInfo,
        };
        await sendRawEvent('m.sticker', stickerContent, {
          timeline: await getTimeline(),
          threadId,
          replyTo,
          myId: client.userId() ?? '',
        });
        if (replyTo) onReplySent?.();
        close();
      } catch (err) {
        toast.error(t('room.settings.widgets.stickerSendFailed', { error: getErrorMessage(err) }));
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [picker, client, threadId, getTimeline, close, replyTo, onReplySent, toast, t]);

  useEffect(() => {
    if (!picker) return;
    const onMouseDown = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', onMouseDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onMouseDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [picker, close]);

  // Teardown widget API on close
  useEffect(() => {
    if (!picker) {
      widgetApiRef.current?.stop?.();
      widgetApiRef.current = null;
      setLoading(true);
    }
  }, [picker]);

  if (!picker) return null;

  const themedUrl = getThemedUrl(widgetUrl, lightTheme);

  return (
    <div ref={wrapRef} className={css.popover}>
      <div className={css.header}>
        <span className={css.headerTitle}>{widgetName || t('room.settings.widgets.stickers')}</span>
        <button
          type="button"
          className={css.closeBtn}
          onClick={close}
          aria-label={t('common.close')}
        >
          <XIcon size={16} />
        </button>
      </div>
      <div className={css.iframeWrap}>
        {loading && (
          <div className={css.loadingState}>
            <SpinnerGapIcon size={20} className="icon-spin" />
            <span>{t('common.loading')}</span>
          </div>
        )}
        <iframe
          ref={iframeRef}
          className={css.iframe}
          src={themedUrl}
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title={t('room.settings.widgets.stickerPicker')}
          onLoad={setupWidgetApi}
        />
      </div>
    </div>
  );
}
