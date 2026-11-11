import { Trans } from 'react-i18next';
import { useSetAtom } from 'jotai';
import type { WizardClient } from '@wizardchat/core';
import { Avatar } from '@/app/components/Avatar';
import { userProfileAtom } from '@/app/store/atoms';
import type { EventEntry } from './entry';
import { useLoadedMembers } from './members';
import * as css from '../Timeline.css';

interface SystemMessageProps {
  event: EventEntry;
  senderName: string;
  client: WizardClient;
  roomId: string;
}

function useProfileOpener(userId: string, roomId: string | null | undefined) {
  const setProfile = useSetAtom(userProfileAtom);
  return (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setProfile({
      userId,
      roomId,
      anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
    });
  };
}

function ProfileNameLink({
  userId,
  roomId,
  client,
  avatarUrl = null,
  showAvatar = false,
  children,
}: {
  userId: string;
  roomId: string | null | undefined;
  client?: WizardClient;
  avatarUrl?: string | null;
  showAvatar?: boolean;
  children?: React.ReactNode;
}) {
  const openProfile = useProfileOpener(userId, roomId);
  const link = (
    <button type="button" className={css.systemMsgName} onClick={openProfile}>
      {children}
    </button>
  );

  if (!showAvatar || !client) return link;

  const name = typeof children === 'string' ? children : userId;

  return (
    <span className={css.systemMsgInlineName}>
      <Avatar
        name={name}
        mxcUrl={avatarUrl}
        client={client}
        size="xs"
        placeholder="logo"
        onAvatarClick={openProfile}
      />
      {link}
    </span>
  );
}

export function SystemMessageDisplay({ event, senderName, client, roomId }: SystemMessageProps) {
  const content = event.content.type === 'membership' ? event.content : null;
  const profile = event.content.type === 'profileChange' ? event.content : null;
  const senderId = event.sender;
  const subjectId = content?.userId ?? profile?.userId ?? senderId;
  const openProfile = useProfileOpener(subjectId, roomId);
  const members = useLoadedMembers(roomId);
  const subject = members.get(subjectId);
  const sender = members.get(senderId);

  const subjectName = subject?.displayName ?? content?.displayName ?? subjectId;
  const subjectAvatar =
    subject?.avatarUrl ?? (subjectId === senderId ? event.senderAvatar : null) ?? null;
  const change = content?.change ?? null;

  let label: React.ReactNode;

  if (profile) {
    const nameLink = <ProfileNameLink userId={subjectId} roomId={roomId} />;
    if (profile.nameChanged && profile.newName && profile.oldName) {
      label = (
        <Trans
          i18nKey="timeline.userChangedName"
          values={{ name: profile.oldName, newName: profile.newName }}
          components={{ name: nameLink }}
        />
      );
    } else if (profile.nameChanged && profile.newName) {
      label = (
        <Trans
          i18nKey="timeline.userSetName"
          values={{ name: subjectId, newName: profile.newName }}
          components={{ name: nameLink }}
        />
      );
    } else if (profile.nameChanged) {
      label = (
        <Trans
          i18nKey="timeline.userRemovedName"
          values={{ name: profile.oldName ?? subjectId }}
          components={{ name: nameLink }}
        />
      );
    } else if (profile.avatarChanged) {
      label = (
        <Trans
          i18nKey="timeline.userChangedAvatar"
          values={{ name: subjectName }}
          components={{ name: nameLink }}
        />
      );
    } else {
      return null;
    }
  } else if (change === 'Joined' || change === 'InvitationAccepted') {
    label = (
      <Trans
        i18nKey="timeline.userJoined"
        values={{ name: subjectName }}
        components={{ name: <ProfileNameLink userId={subjectId} roomId={roomId} /> }}
      />
    );
  } else if (change === 'Kicked') {
    label = (
      <Trans
        i18nKey="timeline.userKicked"
        values={{ user: subjectName, kicker: senderName }}
        components={{
          user: <ProfileNameLink userId={subjectId} roomId={roomId} />,
          kicker: (
            <ProfileNameLink
              userId={senderId}
              roomId={roomId}
              client={client}
              avatarUrl={sender?.avatarUrl ?? event.senderAvatar}
              showAvatar
            />
          ),
        }}
      />
    );
  } else if (change === 'KickedAndBanned') {
    label = (
      <Trans
        i18nKey="timeline.userBanned"
        values={{ name: subjectName }}
        components={{ name: <ProfileNameLink userId={subjectId} roomId={roomId} /> }}
      />
    );
  } else if (change === 'Left') {
    label = (
      <Trans
        i18nKey="timeline.userLeft"
        values={{ name: subjectName }}
        components={{ name: <ProfileNameLink userId={subjectId} roomId={roomId} /> }}
      />
    );
  } else {
    return null;
  }

  return (
    <div className={css.systemMsgRow}>
      <Avatar
        name={subjectName}
        mxcUrl={subjectAvatar}
        client={client}
        size="xs"
        placeholder="logo"
        onAvatarClick={openProfile}
      />
      <span className={css.systemMsgText}>{label}</span>
    </div>
  );
}
