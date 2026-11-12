import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, StickerIcon } from '@phosphor-icons/react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { useAllRoomsPacks, type RoomPackSummary } from '@/app/hooks/useUserPacks';
import { useRoomNames } from './roomNames';
import { Popover } from '@/app/components/Popover';
import { Button } from '@/app/components/Button';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import * as css from './EmojisStickers.css';
import * as skeletonCss from '@/app/features/soundboard/SoundPackEditor.css';

interface Props {
  client: MatrixClient;
  current: RoomPackSummary[];
  onSave: (favorites: RoomPackSummary[]) => void;
}

type PackKey = string;

function makeKey(fav: RoomPackSummary): PackKey {
  return `${fav.roomId}/${fav.stateKey}`;
}

export function FavoritePacksSelect({ client, current, onSave }: Props) {
  const { t } = useTranslation();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<PackKey>>(() => new Set(current.map(makeKey)));

  useEffect(() => {
    if (open) setSelected(new Set(current.map(makeKey)));
  }, [open, current]);

  const packs = useAllRoomsPacks(client);
  const roomNames = useRoomNames();
  const allPacks = useMemo(() => {
    const byRoom = new Map<string, RoomPackSummary[]>();
    for (const pack of packs ?? []) {
      const list = byRoom.get(pack.roomId) ?? [];
      list.push(pack);
      byRoom.set(pack.roomId, list);
    }
    return Array.from(byRoom.entries()).map(([roomId, roomPacks]) => ({
      roomId,
      packSummary: roomPacks.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    }));
  }, [packs]);

  const handleToggle = useCallback(
    (fav: RoomPackSummary) => {
      const key = makeKey(fav);
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      setSelected(next);
      const list = allPacks.flatMap((g) => g.packSummary).filter((p) => next.has(makeKey(p)));
      onSave(list);
    },
    [selected, allPacks, onSave]
  );

  return (
    <>
      <Button ref={anchorRef} variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        {t('settings.emojisStickers.selectPacks')}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        {packs === null ? (
          <div className={css.popRoomGroup} aria-busy="true" aria-label={t('common.loading')}>
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className={skeletonCss.skeleton}
                style={{ height: 28, margin: '6px 8px' }}
              />
            ))}
          </div>
        ) : allPacks.length === 0 ? (
          <div className={css.popEmpty}>{t('settings.emojisStickers.noPacksFound')}</div>
        ) : (
          allPacks.map((group) => {
            const roomName = roomNames.get(group.roomId) ?? group.roomId;
            return (
              <div key={group.roomId} className={css.popRoomGroup}>
                <div className={css.popRoomName}>{roomName}</div>
                {group.packSummary.map((pack) => {
                  const key = makeKey(pack);
                  const isSelected = selected.has(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      role="checkbox"
                      aria-checked={isSelected}
                      className={isSelected ? css.popPackRowSelected : css.popPackRow}
                      onClick={() => handleToggle(pack)}
                    >
                      <span className={css.popPackThumb}>
                        {pack.avatarMxc ? (
                          <AuthMediaImg
                            client={client}
                            mxcUrl={pack.avatarMxc}
                            width={112}
                            height={112}
                            alt=""
                            className={css.popPackThumbImg}
                          />
                        ) : (
                          <StickerIcon size={14} />
                        )}
                      </span>
                      <span className={css.popPackName}>{pack.displayName}</span>
                      <span
                        className={
                          isSelected
                            ? `${css.popPackCheckbox} ${css.popPackCheckboxSelected}`
                            : css.popPackCheckbox
                        }
                      >
                        {isSelected && <CheckIcon size={11} weight="bold" />}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })
        )}
      </Popover>
    </>
  );
}
