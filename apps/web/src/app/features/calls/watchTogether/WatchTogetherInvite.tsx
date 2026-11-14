import { useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { ArrowSquareOutIcon, YoutubeLogoIcon } from '@phosphor-icons/react';
import {
  expectedPosition,
  watchingVideoIdAtom,
  youtubeConsentAtom,
  youtubeWatchUrl,
  type WatchState,
} from './watchTogether';
import { WatchViewers } from './WatchViewers';
import * as css from './WatchTogether.css';

interface Props {
  state: WatchState;
  startedByName: string;
  compact?: boolean;
}

export function WatchTogetherInvite({ state, startedByName, compact }: Props) {
  const { t } = useTranslation();
  const [consent, setConsent] = useAtom(youtubeConsentAtom);
  const setWatching = useSetAtom(watchingVideoIdAtom);
  const [asking, setAsking] = useState(false);

  const watch = () => {
    if (consent) setWatching(state.videoId);
    else setAsking(true);
  };

  if (asking) {
    return (
      <div className={compact ? css.inviteCompact : css.invite}>
        <p className={css.inviteTitle}>{t('call.watchTogether.consentTitle')}</p>
        <p className={css.inviteBody}>{t('call.watchTogether.consentBody')}</p>
        <div className={css.inviteActions}>
          <button type="button" className={css.inviteSecondary} onClick={() => setAsking(false)}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className={css.invitePrimary}
            onClick={() => {
              setConsent(true);
              setWatching(state.videoId);
            }}
          >
            {t('call.watchTogether.watch')}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? css.inviteCompact : css.invite}>
      {!compact && (
        <span className={css.playerTop}>
          <WatchViewers />
        </span>
      )}
      <YoutubeLogoIcon size={compact ? 28 : 44} weight="fill" className={css.inviteIcon} />
      {!compact && (
        <p className={css.inviteTitle}>
          {t('call.watchTogether.startedVideo', { name: startedByName })}
        </p>
      )}
      <button type="button" className={css.invitePrimary} onClick={watch}>
        {t('call.watchTogether.watch')}
      </button>
      {!compact && (
        <a
          className={css.inviteLink}
          href={youtubeWatchUrl(state.videoId)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.currentTarget.href = youtubeWatchUrl(state.videoId, expectedPosition(state));
          }}
        >
          <ArrowSquareOutIcon size={14} />
          {t('call.watchTogether.openOnYouTube')}
        </a>
      )}
    </div>
  );
}
