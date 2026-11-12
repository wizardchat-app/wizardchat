import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckIcon, PencilSimpleIcon, VinylRecordIcon, XIcon } from '@phosphor-icons/react';
import { soundboardEmoji } from '@/call/soundboard';
import type { SoundPack } from '@wizardchat/core';
import { useClient } from '@/app/data';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Popover } from '@/app/components/Popover';
import { SoundPackEditor } from '@/app/features/soundboard/SoundPackEditor';
import { invalidateSoundPacks } from '@/app/features/soundboard/soundPacks';
import * as css from '../emojis/EmojisStickers.css';
import * as editorCss from '@/app/features/soundboard/SoundPackEditor.css';
import * as panelCss from '@/app/components/Settings/Settings.css';

function DefaultPack({ onEdit }: { onEdit: (pack: SoundPack) => void }) {
  const { t } = useTranslation();
  const client = useClient();
  const [pack, setPack] = useState<SoundPack | null>(null);
  useEffect(() => {
    let cancelled = false;
    client
      .mySounds()
      .then((mine) => !cancelled && setPack(mine))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [client]);
  const first = pack?.sounds[0];
  return (
    <div className={panelCss.section}>
      <h3 className={panelCss.sectionTitle}>{t('settings.soundboard.defaultPack')}</h3>
      <p className={panelCss.settingNote} style={{ marginBottom: 12 }}>
        {t('settings.soundboard.defaultPackNote')}
      </p>
      {!pack ? (
        <div className={editorCss.skeleton} style={{ height: 58 }} />
      ) : (
        <div className={css.packCard}>
          <div className={css.packCardPreview} style={{ fontSize: '1.25rem' }}>
            {first ? soundboardEmoji(first.shortcode, first.emoji) : <VinylRecordIcon size={20} />}
          </div>
          <div className={css.packCardInfo}>
            <span className={css.packCardName}>
              {pack?.name || t('call.soundboard.packs.mine')}
            </span>
            <span className={css.packCardMeta}>
              {t('room.settings.sounds.soundCount', { count: pack?.sounds.length ?? 0 })}
            </span>
          </div>
          <div className={css.packCardActions}>
            <Button
              variant="secondary"
              size="sm"
              disabled={!pack}
              onClick={() => pack && onEdit(pack)}
            >
              <PencilSimpleIcon size={14} className={panelCss.iconBefore} />
              {t('common.edit')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectPacks({
  favorites,
  onToggle,
}: {
  favorites: SoundPack[];
  onToggle: (pack: SoundPack) => void;
}) {
  const { t } = useTranslation();
  const client = useClient();
  const anchorRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [all, setAll] = useState<SoundPack[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    client
      .allSoundPacks()
      .then((list) => !cancelled && setAll(list))
      .catch(() => !cancelled && setAll([]));
    return () => {
      cancelled = true;
    };
  }, [client, open]);
  const favoriteIds = useMemo(() => new Set(favorites.map((pack) => pack.id)), [favorites]);
  const packs = all?.map((pack) => ({ ...pack, everywhere: favoriteIds.has(pack.id) })) ?? null;
  const groups = useMemo(() => {
    const byRoom = new Map<string, SoundPack[]>();
    for (const pack of packs ?? []) {
      const key = pack.roomName ?? pack.roomId ?? '';
      byRoom.set(key, [...(byRoom.get(key) ?? []), pack]);
    }
    return [...byRoom.entries()];
  }, [packs]);

  return (
    <>
      <Button ref={anchorRef} variant="secondary" size="sm" onClick={() => setOpen((v) => !v)}>
        {t('settings.emojisStickers.selectPacks')}
      </Button>
      <Popover open={open} onClose={() => setOpen(false)} anchorRef={anchorRef}>
        {groups.length === 0 ? (
          packs ? (
            <div className={css.popEmpty}>{t('settings.emojisStickers.noPacksFound')}</div>
          ) : (
            <div
              className={css.popRoomGroup}
              role="status"
              aria-label={t('call.soundboard.loading')}
            >
              {[0, 1, 2].map((i) => (
                <div
                  key={i}
                  className={editorCss.skeleton}
                  style={{ height: 28, margin: '6px 8px' }}
                />
              ))}
            </div>
          )
        ) : (
          groups.map(([room, list]) => (
            <div key={room} className={css.popRoomGroup}>
              <div className={css.popRoomName}>{room}</div>
              {list.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  role="checkbox"
                  aria-checked={pack.everywhere}
                  className={pack.everywhere ? css.popPackRowSelected : css.popPackRow}
                  onClick={() => onToggle(pack)}
                >
                  <span className={css.popPackThumb}>
                    <VinylRecordIcon size={14} />
                  </span>
                  <span className={css.popPackName}>{pack.name}</span>
                  <span
                    className={
                      pack.everywhere
                        ? `${css.popPackCheckbox} ${css.popPackCheckboxSelected}`
                        : css.popPackCheckbox
                    }
                  >
                    {pack.everywhere && <CheckIcon size={11} weight="bold" />}
                  </span>
                </button>
              ))}
            </div>
          ))
        )}
      </Popover>
    </>
  );
}

function FavoritePacks() {
  const { t } = useTranslation();
  const client = useClient();
  const toast = useToast();
  const [packs, setPacks] = useState<SoundPack[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    client
      .favoriteSoundPacks()
      .then((list) => !cancelled && setPacks(list))
      .catch(() => !cancelled && setPacks([]));
    return () => {
      cancelled = true;
    };
  }, [client]);

  const toggle = async (pack: SoundPack) => {
    const everywhere = !pack.everywhere;
    const set = (on: boolean) =>
      setPacks((prev) => {
        const rest = (prev ?? []).filter((p) => p.id !== pack.id);
        return on ? [...rest, { ...pack, everywhere: true }] : rest;
      });
    set(everywhere);
    try {
      await client.setSoundPackEverywhere(pack.roomId!, pack.stateKey!, everywhere);
      invalidateSoundPacks(client);
    } catch (error) {
      set(!everywhere);
      toast.error(t('common.saveFailed', { error: getErrorMessage(error) }));
    }
  };

  const favorites = packs ?? [];

  return (
    <div className={panelCss.section}>
      <div className={css.headerRow}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className={panelCss.sectionTitle}>{t('settings.soundboard.favoritePacks')}</h3>
          <p className={panelCss.settingNote} style={{ marginBottom: 4 }}>
            {t('settings.soundboard.favoritePacksNote')}
          </p>
        </div>
        <div className={css.headerButton}>
          <SelectPacks favorites={favorites} onToggle={(pack) => void toggle(pack)} />
        </div>
      </div>
      <div style={{ marginTop: 12 }}>
        {!packs ? (
          <div className={editorCss.skeleton} style={{ height: 58 }} />
        ) : favorites.length === 0 ? (
          <div className={css.emptyPacks}>{t('settings.emojisStickers.noFavoritePacks')}</div>
        ) : (
          <div className={css.packList}>
            {favorites.map((pack) => (
              <div key={pack.id} className={css.packCard}>
                <div className={css.packCardPreview}>
                  <VinylRecordIcon size={20} />
                </div>
                <div className={css.packCardInfo}>
                  <span className={css.packCardName}>{pack.name}</span>
                  <span className={css.packCardMeta}>{pack.roomName ?? pack.roomId}</span>
                </div>
                <div className={css.packCardActions}>
                  <IconButton
                    size="sm"
                    onClick={() => void toggle(pack)}
                    aria-label={t('settings.emojisStickers.removeFavorite')}
                    tooltip={t('settings.emojisStickers.removeFavorite')}
                  >
                    <XIcon size={14} />
                  </IconButton>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function SoundboardSettings() {
  const { t } = useTranslation();
  const client = useClient();
  const [editing, setEditing] = useState<SoundPack | null>(null);
  const [revision, setRevision] = useState(0);

  if (editing) {
    return (
      <div>
        <h2 className={panelCss.panelTitle}>{t('settings.soundboard.title')}</h2>
        <SoundPackEditor
          client={client}
          pack={editing}
          onBack={() => setEditing(null)}
          onSave={async (name, attribution, sounds) => {
            await client.saveSoundPack(null, '', name, attribution || null, sounds);
            invalidateSoundPacks(client);
            setEditing(null);
            setRevision((r) => r + 1);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('settings.soundboard.title')}</h2>
      <DefaultPack key={revision} onEdit={setEditing} />
      <div className={panelCss.divider} />
      <FavoritePacks />
    </div>
  );
}
