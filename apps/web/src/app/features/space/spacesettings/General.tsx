import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { JoinRule } from '@wizardchat/core';
import { useAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { CameraIcon, TrashIcon } from '@phosphor-icons/react';
import { developerModeAtom } from '@/app/store/atoms';
import { useConfirm } from '@/app/hooks/useConfirm';
import { refreshRoomSettings, useClient, useRoomDetails, useRoomSettings } from '@/app/data';
import { Avatar, fetchMediaBlobUrl } from '@/app/components/Avatar';
import { Button, CopyButton, IconButton } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import { joinRuleToAccess } from '@/util/matrix';
import * as css from '@/app/components/Settings/Settings.css';
import { NicknameSection } from '@/app/features/room/roomsettings/NicknameSection';
import { vars } from '@/theme/vars.css';

type AccessOption = 'invite' | 'restricted' | 'public' | 'knock';

interface GeneralPanelProps {
  spaceId: string;
}

function isAliasInUse(err: unknown): boolean {
  return getErrorMessage(err).includes('already in use');
}

export function GeneralPanel({ spaceId }: GeneralPanelProps) {
  const { t } = useTranslation();
  const client = useClient();
  const queryClient = useQueryClient();
  const confirmDialog = useConfirm();
  const [devModeEnabled] = useAtom(developerModeAtom);
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useRoomSettings(spaceId);
  const details = useRoomDetails(spaceId);
  const space = settings ?? null;
  const refresh = () => refreshRoomSettings(queryClient, spaceId);

  const currentName: string = details?.name ?? settings?.name ?? '';
  const currentTopic: string = details?.topic ?? settings?.topic ?? '';
  const currentAvatarMxc: string | null = details?.avatarUrl ?? settings?.avatarUrl ?? null;
  const currentJoinRule: string = settings?.joinRule ?? 'invite';
  const spaceName = currentName;

  const can = useCanSendState(spaceId);
  const canSetName = can('m.room.name');
  const canSetTopic = can('m.room.topic');
  const canSetAvatar = can('m.room.avatar');
  const canEditIdentity = canSetName || canSetTopic || canSetAvatar;
  const canSetJoinRules = can('m.room.join_rules');

  // Alias data
  const allAliases: string[] = [...new Set(settings?.localAliases ?? [])];
  const canonicalAlias: string | null = settings?.canonicalAlias || null;
  const canSetCanonical = can('m.room.canonical_alias');

  const [name, setName] = useState(currentName);
  const [topic, setTopic] = useState(currentTopic);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessOption>(
    joinRuleToAccess(currentJoinRule) as AccessOption
  );
  const [saving, setSaving] = useState(false);

  const [newAlias, setNewAlias] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);

  const isDirty =
    name !== currentName ||
    topic !== currentTopic ||
    avatarFile !== null ||
    access !== joinRuleToAccess(currentJoinRule);

  useEffect(() => {
    setName(currentName);
    setTopic(currentTopic);
    setAccess(joinRuleToAccess(currentJoinRule) as AccessOption);
    setAvatarFile(null);
    setAvatarPreview(null);
  }, [spaceId, currentName, currentTopic, currentJoinRule]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirmDialog({
      title: t('common.removeAvatar'),
      message: t('common.removeAvatarConfirm'),
      danger: true,
    });
    if (!ok) return;
    try {
      await client.removeRoomAvatar(spaceId);
      void refresh();
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleSave = async () => {
    if (!space) return;
    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];
      if (avatarFile) {
        const bytes = new Uint8Array(await avatarFile.arrayBuffer());
        ops.push(client.setRoomAvatar(spaceId, bytes, avatarFile.type || 'image/png'));
      }
      if (name.trim() !== currentName) ops.push(client.setRoomName(spaceId, name.trim()));
      if (topic !== currentTopic) ops.push(client.setRoomTopic(spaceId, topic));

      const newJoinRule: JoinRule =
        access === 'public'
          ? 'public'
          : access === 'restricted'
            ? 'restricted'
            : access === 'knock'
              ? 'knock'
              : 'invite';
      if (newJoinRule !== currentJoinRule) {
        ops.push(
          client.setJoinRule(spaceId, newJoinRule, access === 'restricted' ? [spaceId] : [])
        );
      }

      await Promise.all(ops);
      void refresh();
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setSaving(false);
    }
  };

  function isValidAlias(value: string): boolean {
    return /^#[A-Za-z0-9.\-_/=]+:[A-Za-z0-9.\-_]+$/.test(value);
  }

  const canAddAlias = canSetCanonical && isValidAlias(newAlias.trim());

  const handleAddAlias = async () => {
    const trimmed = newAlias.trim();
    if (!isValidAlias(trimmed)) return;
    setAddingAlias(true);
    try {
      await client.addRoomAlias(spaceId, trimmed);
      void refresh();
      setNewAlias('');
    } catch (err) {
      toast.error(
        isAliasInUse(err)
          ? t('room.settings.addresses.aliasInUse')
          : t('room.settings.addresses.invalidFormat')
      );
    } finally {
      setAddingAlias(false);
    }
  };

  const handleRemoveAlias = async (alias: string) => {
    try {
      await client.removeRoomAlias(alias);
      void refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSetCanonical = async (alias: string) => {
    try {
      await client.setCanonicalAlias(spaceId, alias, []);
      void refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <div>
      <h2 className={css.panelTitle}>{t('room.settings.general.title')}</h2>

      <div className={css.section}>
        <div className={css.avatarRow}>
          <div className={css.profileFields}>
            <Input
              label={t('space.name')}
              placeholder={t('space.namePlaceholder')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canSetName}
              maxLength={255}
            />
            <Textarea
              label={t('room.topic')}
              placeholder={t('room.topicPlaceholder')}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              disabled={!canSetTopic}
              rows={3}
            />
          </div>
          <div className={css.avatarUploadWrap}>
            <div
              className={css.avatarClickable}
              onClick={async () => {
                if (currentAvatarMxc || avatarPreview) {
                  if (avatarPreview) {
                    setLightboxSrc(avatarPreview);
                  } else if (currentAvatarMxc) {
                    const blob = await fetchMediaBlobUrl(currentAvatarMxc, client);
                    if (blob) setLightboxSrc(blob);
                  }
                  return;
                }
                if (canSetAvatar) fileRef.current?.click();
              }}
            >
              {avatarPreview ? (
                <img src={avatarPreview} alt="preview" className={css.avatarPreviewImg} />
              ) : (
                <Avatar name={spaceName} mxcUrl={currentAvatarMxc} client={client} size="xl" />
              )}
              {canSetAvatar && !currentAvatarMxc && !avatarPreview && (
                <div className={css.avatarOverlay}>
                  <CameraIcon size={20} className={css.whiteIcon} />
                </div>
              )}
            </div>
            {lightboxSrc && (
              <MediaLightbox
                src={lightboxSrc}
                name={spaceName}
                client={client}
                avatarMxc={currentAvatarMxc}
                onClose={() => setLightboxSrc(null)}
                onReplace={
                  canSetAvatar
                    ? () => {
                        setLightboxSrc(null);
                        setTimeout(() => fileRef.current?.click(), 100);
                      }
                    : undefined
                }
                onRemove={
                  canSetAvatar
                    ? () => {
                        setLightboxSrc(null);
                        handleRemoveAvatar();
                      }
                    : undefined
                }
              />
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className={css.hiddenInput}
              onChange={handleAvatarSelect}
            />
          </div>
        </div>
      </div>

      {canEditIdentity || canSetJoinRules ? (
        <div className={css.actions}>
          <Button
            variant="primary"
            loading={saving}
            spinnerWhileLoading
            onClick={handleSave}
            disabled={!isDirty}
          >
            {t('common.save')}
          </Button>
        </div>
      ) : null}

      <div className={css.divider} />

      <NicknameSection roomId={spaceId} space />

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('room.settings.security.title')}</h3>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('room.settings.security.access')}</span>
          </div>
          <Select
            aria-label={t('room.settings.security.access')}
            value={access}
            disabled={!canSetJoinRules}
            options={[
              { value: 'invite', label: t('room.settings.security.accessInviteSpace') },
              { value: 'knock', label: t('room.settings.security.accessKnock') },
              { value: 'public', label: t('room.settings.security.accessPublic') },
            ]}
            onChange={(v) => setAccess(v as AccessOption)}
          />
        </div>
      </div>

      {devModeEnabled && (
        <>
          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('space.settings.general.spaceId')}</h3>
            <div className={css.tokenRow}>
              <code className={css.tokenField}>{spaceId}</code>
              <CopyButton text={spaceId} />
            </div>
          </div>
        </>
      )}

      <div className={css.divider} />

      <div className={css.section}>
        <h3 className={css.sectionTitle}>{t('room.settings.addresses.title')}</h3>

        {canonicalAlias ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: vars.color.bgSecondary,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                color: vars.color.textPrimary,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {canonicalAlias}
            </span>
            <span
              style={{
                fontSize: '0.72rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: 10,
                backgroundColor: vars.color.accent,
                color: '#fff',
                flexShrink: 0,
              }}
            >
              {t('room.settings.general.title')}
            </span>
          </div>
        ) : (
          <p className={css.settingNote}>{t('room.settings.addresses.noAddresses')}</p>
        )}

        {allAliases.map((alias) => (
          <div
            key={alias}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 12px',
              borderRadius: 8,
              backgroundColor: vars.color.bgSecondary,
              marginBottom: 6,
            }}
          >
            <span
              style={{
                flex: 1,
                fontSize: '0.9rem',
                fontFamily: 'monospace',
                color: vars.color.textPrimary,
                minWidth: 0,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {alias}
            </span>
            {alias !== canonicalAlias && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => handleSetCanonical(alias)}
                disabled={!canSetCanonical}
              >
                {t('room.settings.addresses.mainAddress')}
              </Button>
            )}
            <IconButton
              size="sm"
              onClick={() => handleRemoveAlias(alias)}
              aria-label={t('common.remove')}
              disabled={!canSetCanonical}
            >
              <TrashIcon size={14} />
            </IconButton>
          </div>
        ))}

        <div className={css.flexRowWrap} style={{ marginTop: 16 }}>
          <div className={css.flexOne}>
            <Input
              placeholder={t('room.settings.addresses.addressPlaceholder')}
              value={newAlias}
              onChange={(e) => setNewAlias(e.target.value)}
              disabled={!canSetCanonical}
            />
          </div>
          <Button
            variant="primary"
            loading={addingAlias}
            onClick={handleAddAlias}
            disabled={!canAddAlias}
          >
            {t('room.settings.addresses.addAddress')}
          </Button>
        </div>
      </div>
    </div>
  );
}
