import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PencilSimpleIcon, PlusIcon, TrashIcon, VinylRecordIcon } from '@phosphor-icons/react';
import type { RoomSoundPacks, SoundPack, WizardClient } from '@wizardchat/core';
import { soundboardEmoji } from '@/call/soundboard';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { Button, IconButton } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { Modal } from '@/app/components/Modal';
import { SoundPackEditor } from '@/app/features/soundboard/SoundPackEditor';
import { invalidateSoundPacks } from '@/app/features/soundboard/soundPacks';
import * as css from './RoomSettingsEmojiSticker.css';
import * as editorCss from '@/app/features/soundboard/SoundPackEditor.css';
import * as panelCss from '@/app/components/Settings/Settings.css';

export function SoundsPanel({ client, roomId }: { client: WizardClient; roomId: string }) {
  const { t } = useTranslation();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const [data, setData] = useState<RoomSoundPacks | null>(null);
  const [editing, setEditing] = useState<SoundPack | null>(null);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [newPackName, setNewPackName] = useState('');
  const [creating, setCreating] = useState(false);

  const reload = useCallback(async () => {
    const next = await client
      .roomSoundPacks(roomId)
      .catch((): RoomSoundPacks => ({ canEdit: false, packs: [] }));
    setData(next);
    return next;
  }, [client, roomId]);

  useEffect(() => {
    setData(null);
    void reload();
  }, [reload]);

  const canManage = !!data?.canEdit;
  const packs = data?.packs ?? [];

  const handleCreate = async () => {
    const name = newPackName.trim();
    if (!name || !canManage || creating) return;
    setCreating(true);
    try {
      const key = await client.createSoundPack(roomId, name);
      setCreateModalOpen(false);
      setNewPackName('');
      invalidateSoundPacks(client);
      const next = await reload();
      const created = next.packs.find((pack) => pack.stateKey === key);
      if (created) setEditing(created);
    } catch (err) {
      toast.error(t('room.settings.sounds.createFailed', { error: getErrorMessage(err) }));
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (pack: SoundPack) => {
    const ok = await confirmDialog({
      title: t('room.settings.sounds.deletePack'),
      message: t('room.settings.sounds.deletePackConfirm', { name: pack.name }),
      danger: true,
    });
    if (!ok) return;
    try {
      await client.deleteSoundPack(roomId, pack.stateKey!);
      invalidateSoundPacks(client);
      void reload();
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  if (editing) {
    return (
      <div>
        <h2 className={panelCss.panelTitle}>{t('room.settings.sounds.title')}</h2>
        <SoundPackEditor
          client={client}
          pack={editing}
          readOnly={!canManage}
          onBack={() => setEditing(null)}
          onSave={async (name, attribution, sounds) => {
            await client.saveSoundPack(
              roomId,
              editing.stateKey!,
              name,
              attribution || null,
              sounds
            );
            invalidateSoundPacks(client);
            setEditing(null);
            void reload();
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('room.settings.sounds.title')}</h2>
      <p className={panelCss.settingNote} style={{ marginBottom: 16 }}>
        {t('room.settings.sounds.description')}
      </p>

      <Button variant="primary" onClick={() => setCreateModalOpen(true)} disabled={!canManage}>
        <PlusIcon size={14} className={panelCss.iconBefore} />
        {t('room.settings.sounds.createPack')}
      </Button>

      <div className={panelCss.divider} />

      {!data ? (
        <div className={css.packList}>
          {[0, 1].map((i) => (
            <div key={i} className={editorCss.skeleton} style={{ height: 58 }} />
          ))}
        </div>
      ) : packs.length === 0 ? (
        <div className={css.emptyPacks}>{t('room.settings.sounds.noPacks')}</div>
      ) : (
        <div className={css.packList}>
          {packs.map((pack) => {
            const first = pack.sounds[0];
            return (
              <div key={pack.id} className={css.packCard}>
                <div className={css.packCardPreview} style={{ fontSize: '1.25rem' }}>
                  {first ? (
                    soundboardEmoji(first.shortcode, first.emoji)
                  ) : (
                    <VinylRecordIcon size={20} />
                  )}
                </div>
                <div className={css.packCardInfo}>
                  <span className={css.packCardName}>{pack.name}</span>
                  <span className={css.packCardMeta}>
                    {t('room.settings.sounds.soundCount', { count: pack.sounds.length })}
                  </span>
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
                    onClick={() => void handleDelete(pack)}
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
        title={t('room.settings.sounds.createPack')}
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
              onClick={() => void handleCreate()}
              disabled={!newPackName.trim() || !canManage}
              loading={creating}
            >
              {t('room.settings.sounds.createPack')}
            </Button>
          </div>
        }
      >
        <Input
          label={t('room.settings.sounds.packName')}
          placeholder={t('room.settings.sounds.packNamePlaceholder')}
          value={newPackName}
          onChange={(e) => setNewPackName(e.target.value)}
          onKeyDown={(e: React.KeyboardEvent) => {
            if (e.key === 'Enter') void handleCreate();
          }}
          data-dialog-autofocus
        />
      </Modal>
    </div>
  );
}
