import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { CaretDownIcon, UsersThreeIcon } from '@phosphor-icons/react';
import type { MutualRoom, WizardClient } from '@wizardchat/core';
import { Avatar } from '@/app/components/Avatar';
import * as css from './UserProfilePopup.css';

function path(room: MutualRoom) {
  const id = encodeURIComponent(room.roomId);
  if (room.isSpace) return `/space/${id}`;
  return room.isDirect ? `/dm/${id}` : `/r/${id}`;
}

export function MutualRooms({
  client,
  userId,
  onOpen,
}: {
  client: WizardClient;
  userId: string;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const { data: rooms } = useQuery<MutualRoom[]>({
    queryKey: ['mutualRooms', userId],
    queryFn: () => client.mutualRooms(userId),
    staleTime: 60_000,
  });

  if (!rooms || rooms.length === 0) return null;

  const groups = [
    { label: t('nav.spaces'), items: rooms.filter((r) => r.isSpace) },
    { label: t('nav.rooms'), items: rooms.filter((r) => !r.isSpace && !r.isDirect) },
    { label: t('room.dm.directMessages'), items: rooms.filter((r) => !r.isSpace && r.isDirect) },
  ].filter((group) => group.items.length > 0);

  return (
    <div className={css.mutual}>
      <button
        type="button"
        className={css.mutualToggle}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        <span className={css.infoIcon}>
          <UsersThreeIcon size={14} />
        </span>
        <span className={css.infoValue}>{t('profile.mutualRooms', { count: rooms.length })}</span>
        <CaretDownIcon size={14} className={open ? css.mutualCaretOpen : css.mutualCaret} />
      </button>
      {open && (
        <div className={css.mutualList}>
          {groups.map((group) => (
            <div key={group.label} className={css.mutualGroup}>
              <span className={css.mutualHeading}>{group.label}</span>
              {group.items.map((room) => {
                const name = room.name ?? room.roomId;
                return (
                  <button
                    key={room.roomId}
                    type="button"
                    className={css.mutualItem}
                    onClick={() => {
                      onOpen();
                      navigate(path(room));
                    }}
                  >
                    <Avatar name={name} mxcUrl={room.avatarUrl} client={client} size="xs" />
                    <span className={css.mutualName}>{name}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
