import { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, StickerIcon, TrashIcon, PencilSimpleIcon } from '@phosphor-icons/react';
import type { WizardClient } from '@wizardchat/core';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { invalidateImagePacks } from '@/app/hooks/useUserPacks';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Modal } from '@/app/components/Modal';
import {
  ROOM_PACK_STABLE,
  ROOM_PACK_UNSTABLE,
  ROOM_PACK_TYPES,
  mergePackImageMap,
  mergePackInfo,
} from '@/app/features/settings/emojis/imagePackTypes';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import { PackEditor, type PackData } from './PackEditor';
import * as css from './RoomSettingsEmojiSticker.css';
import * as skeletonCss from '@/app/features/soundboard/SoundPackEditor.css';
import * as panelCss from '@/app/components/Settings/Settings.css';

const PONIES_ROOM_EMOTES = 'im.ponies.room_emotes';

function isMeaningfulPackContent(content: Record<string, unknown> | undefined): boolean {
  if (!content || typeof content !== 'object') return false;
  const pack = content.pack;
  if (pack && typeof pack === 'object' && Object.keys(pack as Record<string, unknown>).length > 0) {
    return true;
  }
  const images = content.images;
  return !!images && typeof images === 'object' && Object.keys(images).length > 0;
}

async function readRoomPackContents(
  client: WizardClient,
  roomId: string
): Promise<Map<string, Record<string, unknown>[]>> {
  const byStateKey = new Map<string, Record<string, unknown>[]>();
  const results = await Promise.all(
    ROOM_PACK_TYPES.map((type) => client.stateEventsOfType(roomId, type).catch(() => []))
  );
  for (const events of results) {
    for (const [stateKey, content] of events) {
      const list = byStateKey.get(stateKey);
      if (list) list.push(content);
      else byStateKey.set(stateKey, [content]);
    }
  }
  for (const [stateKey, contents] of byStateKey) {
    if (!contents.some(isMeaningfulPackContent)) byStateKey.delete(stateKey);
  }
  return byStateKey;
}

function getPackEvents(
  packEvents: Map<string, Record<string, unknown>[]>
): { stateKey: string; content: Record<string, unknown> }[] {
  return Array.from(packEvents.entries()).map(([stateKey, contents]) => {
    const info = mergePackInfo(...contents);
    return {
      stateKey,
      content: {
        pack: {
          display_name: info.displayName,
          usage: info.usage,
          avatar_url: info.avatarUrl,
          attribution: info.attribution,
        },
        images: mergePackImageMap(...contents),
      },
    };
  });
}

function parsePacks(packEvents: Map<string, Record<string, unknown>[]>): PackData[] {
  return getPackEvents(packEvents).map(({ stateKey, content }) => {
    const pack = content?.pack as Record<string, unknown> | undefined;
    const imagesRaw = content?.images as Record<string, unknown> | undefined;
    const displayName: string = (pack?.display_name as string) || stateKey;
    const usage: string[] =
      Array.isArray(pack?.usage) && (pack.usage as string[]).length > 0
        ? (pack.usage as string[])
        : ['emoticon', 'sticker'];
    const images: Record<
      string,
      {
        shortcode: string;
        url: string;
        usage: string[];
        body?: string;
        mimetype?: string;
        info?: Record<string, unknown>;
      }
    > = {};
    if (imagesRaw) {
      for (const [shortcode, img] of Object.entries(imagesRaw)) {
        const imgObj = img as Record<string, unknown>;
        images[shortcode] = {
          shortcode,
          url: (imgObj.url as string) || '',
          usage: Array.isArray(imgObj.usage) ? (imgObj.usage as string[]) : [],
          body: imgObj.body as string | undefined,
          mimetype: imgObj.mimetype as string | undefined,
          info:
            imgObj.info && typeof imgObj.info === 'object'
              ? (imgObj.info as Record<string, unknown>)
              : undefined,
        };
      }
    }
    return {
      stateKey,
      displayName,
      usage,
      images,
      avatarUrl: typeof pack?.avatar_url === 'string' ? pack.avatar_url : undefined,
      attribution: typeof pack?.attribution === 'string' ? pack.attribution : undefined,
    };
  });
}

interface Props {
  client: WizardClient;
  roomId: string;
}

export function EmojiStickerPanel({ client, roomId }: Props) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirmDialog = useConfirm();

  const can = useCanSendState(roomId);
  const canManage = can(PONIES_ROOM_EMOTES);
  const [packs, setPacks] = useState<PackData[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [editing, setEditing] = useState<PackData | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPackName, setNewPackName] = useState('');
  const [creating, setCreating] = useState(false);
  const creatingRef = useRef(false);

  const reload = useCallback(async () => {
    const packEvents = await readRoomPackContents(client, roomId);
    setPacks(parsePacks(packEvents));
  }, [client, roomId]);

  useEffect(() => {
    let cancelled = false;
    setPacks([]);
    setLoaded(false);
    readRoomPackContents(client, roomId)
      .then((packEvents) => {
        if (!cancelled) setPacks(parsePacks(packEvents));
      })
      .catch(() => {})
      .finally(() => !cancelled && setLoaded(true));
    const onState = (event: Event) => {
      const { roomId: changedRoom, eventType } = (
        event as CustomEvent<{ roomId: string; eventType: string }>
      ).detail;
      if (changedRoom !== roomId || !(ROOM_PACK_TYPES as readonly string[]).includes(eventType)) {
        return;
      }
      readRoomPackContents(client, roomId)
        .then((packEvents) => {
          if (!cancelled) setPacks(parsePacks(packEvents));
        })
        .catch(() => {});
    };
    window.addEventListener('wizardchat:state', onState);
    return () => {
      cancelled = true;
      window.removeEventListener('wizardchat:state', onState);
    };
  }, [client, roomId]);

  const canCreatePack = newPackName.trim().length > 0 && canManage;

  const handleCreate = useCallback(async () => {
    if (!canCreatePack || creatingRef.current) return;
    creatingRef.current = true;
    setCreating(true);
    const name = newPackName.trim();
    const stateKey = crypto.randomUUID();
    try {
      const content = {
        pack: { display_name: name, usage: ['emoticon', 'sticker'] },
        images: {},
      };
      await Promise.all([
        client.setStateEvent(roomId, ROOM_PACK_UNSTABLE, stateKey, content),
        client.setStateEvent(roomId, ROOM_PACK_STABLE, stateKey, content),
      ]);
      void reload();
      invalidateImagePacks();
      setCreateModalOpen(false);
      setNewPackName('');
    } catch (err) {
      toast.error(t('room.settings.emojis.createFailed', { error: getErrorMessage(err) }));
    } finally {
      creatingRef.current = false;
      setCreating(false);
    }
  }, [canCreatePack, newPackName, client, roomId, reload, toast, t]);

  const handleSavePack = useCallback(
    async (updated: PackData) => {
      const imagesContent: Record<
        string,
        {
          url: string;
          usage?: string[];
          body?: string;
          mimetype?: string;
          info?: Record<string, unknown>;
        }
      > = {};
      for (const [key, img] of Object.entries(updated.images)) {
        imagesContent[key] = {
          url: img.url,
          usage: img.usage.length > 0 ? img.usage : undefined,
          body: img.body ?? key,
          mimetype: img.mimetype,
          info: img.info,
        };
      }
      const content = {
        pack: {
          display_name: updated.displayName,
          usage: updated.usage,
          avatar_url: updated.avatarUrl,
          attribution: updated.attribution || undefined,
        },
        images: imagesContent,
      };
      await Promise.all([
        client.setStateEvent(roomId, ROOM_PACK_UNSTABLE, updated.stateKey, content),
        client.setStateEvent(roomId, ROOM_PACK_STABLE, updated.stateKey, content),
      ]);
      void reload();
      invalidateImagePacks();
      setEditing(null);
    },
    [client, roomId, reload]
  );

  const handleDelete = useCallback(
    async (pack: PackData) => {
      const ok = await confirmDialog({
        title: t('room.settings.emojis.deletePack'),
        message: t('room.settings.emojis.deletePackConfirm', { name: pack.displayName }),
        danger: true,
      });
      if (!ok) return;
      try {
        const empty = { images: {} };
        await Promise.all([
          client.setStateEvent(roomId, ROOM_PACK_UNSTABLE, pack.stateKey, empty),
          client.setStateEvent(roomId, ROOM_PACK_STABLE, pack.stateKey, empty),
        ]);
        void reload();
        invalidateImagePacks();
      } catch (err) {
        toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
      }
    },
    [client, confirmDialog, roomId, reload, toast, t]
  );

  if (editing) {
    return (
      <div>
        <h2 className={panelCss.panelTitle}>{t('room.settings.emojis.title')}</h2>
        <PackEditor
          client={client}
          roomId={roomId}
          pack={editing}
          onSave={handleSavePack}
          onBack={() => setEditing(null)}
          readOnly={!canManage}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('room.settings.emojis.title')}</h2>
      <p className={panelCss.settingNote} style={{ marginBottom: 16 }}>
        {t('room.settings.emojis.description')}
      </p>

      <Button variant="primary" onClick={() => setCreateModalOpen(true)} disabled={!canManage}>
        <PlusIcon size={14} className={panelCss.iconBefore} />
        {t('room.settings.emojis.createPack')}
      </Button>

      <div className={panelCss.divider} />

      {!loaded ? (
        <div className={css.packList} aria-busy="true" aria-label={t('common.loading')}>
          {[0, 1].map((i) => (
            <div key={i} className={skeletonCss.skeleton} style={{ height: 58 }} />
          ))}
        </div>
      ) : packs.length === 0 ? (
        <div className={css.emptyPacks}>{t('room.settings.emojis.noPacks')}</div>
      ) : (
        <div className={css.packList}>
          {packs.map((pack) => {
            const previewEntries = pack.avatarUrl ? [] : Object.entries(pack.images).slice(0, 1);
            const previewUrl = pack.avatarUrl ?? previewEntries[0]?.[1]?.url;
            return (
              <div key={pack.stateKey} className={css.packCard}>
                <div className={css.packCardPreview}>
                  {previewUrl ? (
                    <AuthMediaImg
                      client={client}
                      mxcUrl={previewUrl}
                      width={28}
                      height={28}
                      alt={pack.displayName}
                      className={css.packCardPreviewImg}
                      title={pack.displayName}
                    />
                  ) : (
                    <StickerIcon size={20} />
                  )}
                </div>
                <div className={css.packCardInfo}>
                  <span className={css.packCardName}>{pack.displayName}</span>
                </div>
                <div className={css.packCardActions}>
                  <IconButton
                    size="sm"
                    onClick={() => setEditing(pack)}
                    aria-label={t('common.edit')}
                    tooltip={t('common.edit')}
                    disabled={!canManage}
                  >
                    <PencilSimpleIcon size={14} />
                  </IconButton>
                  <IconButton
                    size="sm"
                    onClick={() => handleDelete(pack)}
                    aria-label={t('common.delete')}
                    tooltip={t('common.delete')}
                    disabled={!canManage}
                  >
                    <TrashIcon size={14} className={css.dangerIcon} />
                  </IconButton>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal
        open={createModalOpen}
        onClose={() => {
          setCreateModalOpen(false);
          setNewPackName('');
        }}
        title={t('room.settings.emojis.createPack')}
        size="sm"
        footer={
          <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
            <Button
              variant="secondary"
              onClick={() => {
                setCreateModalOpen(false);
                setNewPackName('');
              }}
            >
              {t('common.cancel')}
            </Button>
            <Button
              variant="primary"
              onClick={handleCreate}
              disabled={!canCreatePack}
              loading={creating}
            >
              {t('room.settings.emojis.createPack')}
            </Button>
          </div>
        }
      >
        <Input
          label={t('room.settings.emojis.packName')}
          placeholder={t('room.settings.emojis.packNamePlaceholder')}
          value={newPackName}
          disabled={!canManage}
          onChange={(e) => setNewPackName(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter') handleCreate();
          }}
          data-dialog-autofocus
        />
      </Modal>
    </div>
  );
}
