import { useTranslation } from 'react-i18next';
import { useAtomValue, useSetAtom } from 'jotai';
import { HashStraightIcon, XIcon } from '@phosphor-icons/react';
import type { WizardClient } from '@wizardchat/core';
import { useRoom } from '@/app/data';
import { Tooltip } from '@/app/components/Tooltip';
import { PanelResizer } from '@/app/components/PanelResizer/PanelResizer';
import {
  threadPanelWidthAtom,
  THREAD_PANEL_WIDTH_MIN,
  THREAD_PANEL_WIDTH_MAX,
  THREAD_PANEL_WIDTH_DEFAULT,
} from '@/app/store/atoms';
import { Timeline } from '@/app/features/timeline';
import * as panelCss from './SidePanel.css';
import * as css from './VoiceRoomChatPanel.css';

interface VoiceRoomChatPanelProps {
  client: WizardClient;
  roomId: string;
  className?: string;
  onClose: () => void;
}

export function VoiceRoomChatPanel({
  client,
  roomId,
  className,
  onClose,
}: VoiceRoomChatPanelProps) {
  const { t } = useTranslation();
  const threadPanelWidth = useAtomValue(threadPanelWidthAtom);
  const setThreadPanelWidth = useSetAtom(threadPanelWidthAtom);

  const room = useRoom(roomId);

  return (
    <aside
      className={`${panelCss.sidePanel}${className ? ` ${className}` : ''}`}
      aria-label={t('room.openChat')}
      style={{ width: `${threadPanelWidth}px` }}
    >
      <PanelResizer
        width={threadPanelWidth}
        onWidthChange={setThreadPanelWidth}
        defaultWidth={THREAD_PANEL_WIDTH_DEFAULT}
        min={THREAD_PANEL_WIDTH_MIN}
        max={THREAD_PANEL_WIDTH_MAX}
      />

      <div className={panelCss.sidePanelHeader}>
        <HashStraightIcon size={16} className={css.titleIcon} />
        <h2 className={panelCss.sidePanelTitle}>{room?.name ?? roomId}</h2>
        <Tooltip content={t('common.close')}>
          <button
            type="button"
            className={panelCss.sidePanelClose}
            onClick={onClose}
            aria-label={t('common.close')}
          >
            <XIcon size={16} />
          </button>
        </Tooltip>
      </div>
      <div className={css.panelBody}>
        <Timeline client={client} roomId={roomId} hideHeader />
      </div>
    </aside>
  );
}
