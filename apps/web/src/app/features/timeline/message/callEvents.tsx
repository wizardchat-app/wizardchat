import { useAtomValue, useSetAtom } from 'jotai';
import { Trans, useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { PhoneIcon, PhoneXIcon, VideoCameraIcon } from '@phosphor-icons/react';
import type { CallHistoryView, WizardClient as MatrixClient } from '@wizardchat/core';
import { useRoom } from '@/app/data';
import { callActionsAtom, callUiAtom } from '@/app/store/atoms/call';
import { userProfileAtom } from '@/app/store/atoms';
import { useUsernameColor } from '@/app/hooks/useUsernameColor';
import { useLoadedMembers } from './members';
import { formatTime } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import * as css from '../Timeline.css';

interface CallHistoryProps {
  call: CallHistoryView;
  client: MatrixClient;
  roomId?: string | null;
}

export function callDuration(ms: number, t: TFunction): string {
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return t('call.event.fewSeconds');
  if (minutes < 60) return t('call.event.minutes', { count: minutes });
  return t('call.event.hours', { count: Math.round(minutes / 60) });
}

function callLine(call: CallHistoryView, me: string | null, t: TFunction) {
  const mine = call.startedBy === me;
  switch (call.outcome) {
    case 'ongoing':
      return { key: mine ? 'call.event.startedYou' : 'call.event.started' };
    case 'ended':
      if (call.partial || call.endedAt === null) {
        return { key: mine ? 'call.event.startedYou' : 'call.event.started' };
      }
      return {
        key: mine ? 'call.event.lastedYou' : 'call.event.lasted',
        duration: callDuration(call.endedAt - call.startedAt, t),
      };
    case 'missed':
      return { key: 'call.event.missedFrom' };
    case 'declined':
      if (mine) return { key: 'call.event.declinedYours' };
      return {
        key:
          me && call.declinedBy.includes(me)
            ? 'call.event.declinedByYou'
            : 'call.event.declinedOther',
      };
    case 'unanswered':
      return { key: mine ? 'call.event.unansweredYours' : 'call.event.unansweredOther' };
  }
}

export function CallHistoryDisplay({ call, client, roomId }: CallHistoryProps) {
  const { t, i18n } = useTranslation();
  const room = useRoom(roomId);
  const callUi = useAtomValue(callUiAtom);
  const callActions = useAtomValue(callActionsAtom);
  const members = useLoadedMembers(roomId);
  const colorFor = useUsernameColor();
  const setProfile = useSetAtom(userProfileAtom);

  const isOngoing = call.outcome === 'ongoing';
  const answered = isOngoing || call.outcome === 'ended';
  const inCall = !!room?.inCall || (!!roomId && callUi.roomId === roomId);
  const name =
    members.get(call.startedBy)?.displayName ??
    call.participants.find((p) => p.userId === call.startedBy)?.displayName ??
    formatUserId(call.startedBy);
  const { key, duration } = callLine(call, client.userId(), t);

  return (
    <div className={css.callLine}>
      <span
        className={answered ? css.callLineIcon : css.callLineIconMissed}
        role="img"
        aria-label={t(call.video ? 'timeline.videoCall' : 'timeline.voiceCall')}
      >
        {!answered ? (
          <PhoneXIcon size={18} weight="fill" />
        ) : call.video ? (
          <VideoCameraIcon size={18} weight="fill" />
        ) : (
          <PhoneIcon size={18} weight="fill" />
        )}
      </span>
      <span className={css.callLineText}>
        <Trans
          i18nKey={key}
          values={{ name, duration }}
          components={{
            name: (
              <button
                type="button"
                className={css.callLineName}
                style={{ color: colorFor(call.startedBy) }}
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setProfile({
                    userId: call.startedBy,
                    roomId,
                    anchorRect: {
                      top: rect.top,
                      left: rect.left,
                      width: rect.width,
                      height: rect.height,
                    },
                  });
                }}
              />
            ),
          }}
        />{' '}
        <span className={css.callLineTime}>{formatTime(call.startedAt, i18n.language)}</span>
      </span>
      {isOngoing && !inCall && roomId && callActions && (
        <button
          type="button"
          className={css.callLineJoin}
          onClick={() =>
            void callActions.start(roomId, {
              voiceOnly: !!room?.isVoice || !call.video,
              presentation: 'room',
              ring: false,
            })
          }
        >
          {t('common.join')}
        </button>
      )}
    </div>
  );
}
