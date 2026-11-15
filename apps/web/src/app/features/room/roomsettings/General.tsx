import React, { useState, useRef, useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { HistoryVisibility, JoinRule } from '@wizardchat/core';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { CameraIcon, ArrowUpIcon, TrashIcon } from '@phosphor-icons/react';
import { useConfirm } from '@/app/hooks/useConfirm';
import {
  parentSpacesOf,
  refreshRoomSettings,
  useClient,
  useMembers,
  useRoom,
  useRoomDetails,
  useRoomSettings,
  useSpaceGraph,
  useUserId,
} from '@/app/data';
import { Avatar, fetchMediaBlobUrl } from '@/app/components/Avatar';
import { Button, IconButton } from '@/app/components/Button';
import { Input, Textarea } from '@/app/components/Input';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { Select } from '@/app/components/Select';
import { useToast } from '@/app/hooks/useToast';
import { useCanSendState } from '@/app/hooks/useCanSendState';
import { getErrorMessage } from '@/util/error';
import { joinRuleToAccess } from '@/util/matrix';
import { Toggle } from '@/app/components/Toggle';
import * as css from '@/app/components/Settings/Settings.css';
import { NicknameSection } from './NicknameSection';
import { RoomBridges } from './RoomBridges';
import { vars } from '@/theme/vars.css';

type AccessOption = 'invite' | 'restricted' | 'public' | 'knock';

interface GeneralPanelProps {
  roomId: string;
  onClose: () => void;
}

function isAliasInUse(err: unknown): boolean {
  return getErrorMessage(err).includes('already in use');
}

export function GeneralPanel({ roomId, onClose }: GeneralPanelProps) {
  const { t } = useTranslation();
  const client = useClient();
  const queryClient = useQueryClient();
  const myUserId = useUserId();
  const confirmDialog = useConfirm();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: settings } = useRoomSettings(roomId);
  const details = useRoomDetails(roomId);
  const summary = useRoom(roomId);
  const isDm = !!summary?.isDirect;
  const room = settings ?? null;
  const graph = useSpaceGraph();
  const { data: roomMembers } = useMembers(roomId);
  const refresh = () => refreshRoomSettings(queryClient, roomId);

  const currentName: string = details?.name ?? settings?.name ?? '';
  const currentTopic: string = details?.topic ?? settings?.topic ?? '';
  const currentAvatarMxc: string | null = details?.avatarUrl ?? settings?.avatarUrl ?? null;
  // A DM without its own avatar shows the other person's, as the room list does
  const shownAvatarMxc = currentAvatarMxc ?? (isDm ? (summary?.dmUserAvatar ?? null) : null);
  const isEncrypted: boolean = details?.isEncrypted ?? settings?.encrypted ?? false;
  const currentJoinRule: string = settings?.joinRule ?? 'invite';
  const currentHistory: HistoryVisibility = settings?.historyVisibility ?? 'joined';
  const roomName = currentName;

  const can = useCanSendState(roomId);
  const canSetName = can('m.room.name');
  const canSetTopic = can('m.room.topic');
  const canSetAvatar = can('m.room.avatar');
  const canEditIdentity = canSetName || canSetTopic || canSetAvatar;
  const canEnableEncryption = can('m.room.encryption');
  const canSetJoinRules = can('m.room.join_rules');
  const canSetHistory = can('m.room.history_visibility');

  const spaceId = parentSpacesOf(graph, roomId)[0] ?? null;

  const historyOptions: { value: HistoryVisibility; label: string }[] = [
    { value: 'world_readable', label: t('room.settings.security.historyAnyone') },
    { value: 'shared', label: t('room.settings.security.historyShared') },
    { value: 'invited', label: t('room.settings.security.historyInvited') },
    { value: 'joined', label: t('room.settings.security.historyMembersSinceJoin') },
  ];

  // Alias data
  const canonicalAlias: string | null = settings?.canonicalAlias || null;
  const altAliases: string[] = settings?.altAliases ?? [];
  const allAliases: string[] = [...new Set(altAliases.filter((a) => a !== canonicalAlias))];
  const canSetCanonical = can('m.room.canonical_alias');

  const [name, setName] = useState(currentName);
  const [topic, setTopic] = useState(currentTopic);
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [lightboxSrc, setLightboxSrc] = useState<string | null>(null);
  const [access, setAccess] = useState<AccessOption>(
    joinRuleToAccess(currentJoinRule) as AccessOption
  );
  const [history, setHistory] = useState<HistoryVisibility>(currentHistory);
  const [historySaving, setHistorySaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [enablingEncryption, setEnablingEncryption] = useState(false);

  const [newAlias, setNewAlias] = useState('');
  const [addingAlias, setAddingAlias] = useState(false);
  const navigate = useNavigate();

  const isDirty =
    name !== currentName ||
    topic !== currentTopic ||
    avatarFile !== null ||
    access !== joinRuleToAccess(currentJoinRule);

  useEffect(() => {
    setName(currentName);
    setTopic(currentTopic);
    setAccess(joinRuleToAccess(currentJoinRule) as AccessOption);
    setHistory(currentHistory);
    setAvatarFile(null);
    setAvatarPreview(null);
  }, [roomId, currentName, currentTopic, currentJoinRule, currentHistory]);

  const handleAvatarSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setAvatarFile(file);
    setAvatarPreview(URL.createObjectURL(file));
  };

  const handleRemoveAvatar = async () => {
    const ok = await confirmDialog(
      isDm
        ? {
            title: t('room.settings.general.resetAvatar'),
            message: t('room.dm.resetAvatarConfirm', {
              name: summary?.dmUserName ?? summary?.dmUserId ?? roomName,
            }),
          }
        : {
            title: t('common.removeAvatar'),
            message: t('common.removeAvatarConfirm'),
            danger: true,
          }
    );
    if (!ok) return;
    try {
      await client.removeRoomAvatar(roomId);
      void refresh();
      setAvatarFile(null);
      setAvatarPreview(null);
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const handleUpgrade = async () => {
    const confirmed = await confirmDialog({
      title: t('room.upgrade.title'),
      message: t('room.upgrade.confirm'),
      danger: true,
    });
    if (!confirmed || !room) return;
    setUpgrading(true);
    try {
      // Find parent spaces before upgrade
      const parentSpaces = parentSpacesOf(graph, roomId);

      const { defaultRoomVersion: newVersion } = await client.serverCapabilities();
      const newRoomId = await client.upgradeRoom(roomId, newVersion);

      const joinRule = settings?.joinRule;
      if (joinRule !== 'public') {
        const members = (roomMembers ?? []).filter((m) => !m.isInvite);
        await Promise.allSettled(
          members
            .filter((m) => m.userId !== myUserId)
            .map((m) => client.invite(newRoomId, m.userId))
        );
      }

      // Re-attach new room to parent spaces
      await Promise.allSettled(
        parentSpaces.map((parentId) => client.addToSpace(parentId, newRoomId, false))
      );

      onClose();
      navigate(`/r/${encodeURIComponent(newRoomId)}`);
    } catch (err) {
      toast.error(t('room.upgrade.failed', { error: getErrorMessage(err) }));
    } finally {
      setUpgrading(false);
    }
  };

  const handleSave = async () => {
    if (!room) return;
    setSaving(true);
    try {
      const ops: Promise<unknown>[] = [];
      if (avatarFile) {
        const bytes = new Uint8Array(await avatarFile.arrayBuffer());
        ops.push(client.setRoomAvatar(roomId, bytes, avatarFile.type || 'image/png'));
      }
      if (name.trim() !== currentName) ops.push(client.setRoomName(roomId, name.trim()));
      if (topic !== currentTopic) ops.push(client.setRoomTopic(roomId, topic));

      const targetJoinRule: JoinRule =
        access === 'public'
          ? 'public'
          : access === 'restricted'
            ? 'restricted'
            : access === 'knock'
              ? 'knock'
              : 'invite';
      if (targetJoinRule !== currentJoinRule) {
        ops.push(
          client.setJoinRule(
            roomId,
            targetJoinRule,
            access === 'restricted' && spaceId ? [spaceId] : []
          )
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

  const handleEnableEncryption = async () => {
    if (!room || isEncrypted || !canEnableEncryption) return;

    let message = t('room.settings.general.encryptionConfirm');
    if (joinRuleToAccess(room.joinRule) === 'public') {
      message = `${t('room.settings.general.encryptionPublicRoomWarning')}\n\n${message}`;
    }

    const ok = await confirmDialog({
      title: t('room.settings.general.e2ee'),
      message,
      danger: true,
    });
    if (!ok) return;

    setEnablingEncryption(true);
    try {
      await client.enableEncryption(roomId);
      void refresh();
    } catch (err) {
      toast.error(
        t('room.settings.general.encryptionEnableFailed', { error: getErrorMessage(err) })
      );
    } finally {
      setEnablingEncryption(false);
    }
  };

  const handleHistoryChange = async (value: HistoryVisibility) => {
    if (!room || value === currentHistory || historySaving) return;
    setHistory(value);
    setHistorySaving(true);
    try {
      await client.setHistoryVisibility(roomId, value);
      await refresh();
    } catch (err) {
      setHistory(currentHistory);
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    } finally {
      setHistorySaving(false);
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
      await client.addRoomAlias(roomId, trimmed);
      const currentAlt: string[] = settings?.altAliases ?? [];
      if (!currentAlt.includes(trimmed)) {
        await client.setCanonicalAlias(roomId, settings?.canonicalAlias || null, [
          ...currentAlt,
          trimmed,
        ]);
      }
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
      const currentAlt: string[] = settings?.altAliases ?? [];
      const currentCanonical = settings?.canonicalAlias || null;
      await client.setCanonicalAlias(
        roomId,
        currentCanonical === alias ? null : currentCanonical,
        currentAlt.filter((a) => a !== alias)
      );
      void refresh();
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const handleSetCanonical = async (alias: string) => {
    try {
      const currentCanonical = settings?.canonicalAlias || undefined;
      const currentAlt: string[] = settings?.altAliases ?? [];
      const newAlt = [
        ...new Set([
          ...(currentCanonical && currentCanonical !== alias ? [currentCanonical] : []),
          ...currentAlt.filter((a) => a !== alias),
        ]),
      ];
      await client.setCanonicalAlias(roomId, alias, newAlt);
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
              label={t('room.name')}
              placeholder={t('room.namePlaceholder')}
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
                <Avatar name={roomName} mxcUrl={shownAvatarMxc} client={client} size="xl" />
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
                name={roomName}
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
            {isDm && canSetAvatar && currentAvatarMxc && !avatarPreview && (
              <Button variant="secondary" size="sm" onClick={() => void handleRemoveAvatar()}>
                {t('room.settings.general.resetAvatar')}
              </Button>
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

      <NicknameSection roomId={roomId} />

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
              { value: 'invite', label: t('room.settings.security.accessInvite') },
              ...(spaceId
                ? [{ value: 'restricted', label: t('room.settings.security.accessSpaceMembers') }]
                : []),
              { value: 'knock', label: t('room.settings.security.accessKnock') },
              { value: 'public', label: t('room.settings.security.accessPublic') },
            ]}
            onChange={(v) => setAccess(v as AccessOption)}
          />
        </div>

        <div className={css.settingRow}>
          <div className={css.settingInfo}>
            <span className={css.settingLabel}>{t('room.settings.security.messageHistory')}</span>
            <span className={css.settingNote}>{t('room.settings.security.historyNote')}</span>
          </div>
          <Select
            aria-label={t('room.settings.security.messageHistory')}
            value={history}
            disabled={!canSetHistory || historySaving}
            options={historyOptions}
            onChange={(v) => handleHistoryChange(v as HistoryVisibility)}
          />
        </div>

        {room && !room.isSpace && (
          <div className={css.settingRow}>
            <div className={css.settingInfo}>
              <span className={css.settingLabel}>{t('room.settings.general.e2ee')}</span>
              <span className={css.settingNote}>
                {isEncrypted
                  ? t('room.settings.general.encryptionEnabledNote')
                  : t('room.settings.general.encryptionNote')}
              </span>
            </div>
            <Toggle
              checked={isEncrypted}
              disabled={isEncrypted || !canEnableEncryption || enablingEncryption}
              onChange={(checked) => {
                if (checked) handleEnableEncryption();
              }}
              ariaLabel={t('room.settings.general.e2ee')}
            />
          </div>
        )}
      </div>

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

      <RoomBridges roomId={roomId} />

      {can('m.room.tombstone') && room && (
        <>
          <div className={css.divider} />

          <div className={css.section}>
            <h3 className={css.sectionTitle}>{t('room.upgrade.title')}</h3>
            <p className={css.settingNote}>
              {t('room.upgrade.currentVersion', { version: room.roomVersion })}
            </p>
            <Button
              variant="secondary"
              loading={upgrading}
              onClick={handleUpgrade}
              disabled={saving}
            >
              <ArrowUpIcon size={14} className={css.iconBefore} />
              {t('room.upgrade.title')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
