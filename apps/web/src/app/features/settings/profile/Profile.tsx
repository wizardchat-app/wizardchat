import { useRef, useState } from 'react';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { ImageIcon, PencilSimpleIcon, PlusCircleIcon, TrashIcon } from '@phosphor-icons/react';
import { ownPresenceAtom, presenceOverrideAtom, presenceVisibleAtom } from '@/app/store/atoms';
import { Avatar, useAvatarBlobUrl } from '@/app/components/Avatar';
import { CopyButton } from '@/app/components/Button';
import { Tooltip } from '@/app/components/Tooltip';
import { useProfile } from '@/app/hooks/useProfile';
import { useUserBanner, useUserBannerBlob } from '@/app/hooks/useUserBanner';
import { useBannerGradient } from '@/app/hooks/useBannerGradient';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useSyncReady } from '@/app/hooks/useSync';
import { useToast } from '@/app/hooks/useToast';
import { anchorFromElement, useContextMenu } from '@/app/hooks/useContextMenu';
import { customStatusDialogOpenAtom, useUserStatusText } from '@/app/features/status/customStatus';
import { PresenceDot, usePresenceMenu } from '@/app/features/status/usePresenceMenu';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { getErrorMessage } from '@/util/error';
import * as popupCss from '@/app/features/profile/UserProfilePopup.css';
import * as layoutCss from '../Settings.css';
import * as css from './Profile.css';

export function ProfileSettings() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const toast = useToast();
  const confirmDialog = useConfirm();
  const { openContextMenuAt } = useContextMenu();
  const { profile, saveProfile, removeAvatar } = useProfile();
  const userId = profile?.userId ?? null;
  const { banner, saveBanner, removeBanner } = useUserBanner(client, userId);
  const { data: bannerSrc } = useUserBannerBlob(client, banner?.mxc);
  const { data: avatarBlob } = useAvatarBlobUrl(profile?.avatarUrl ?? null, client);
  const bannerGradient = useBannerGradient(avatarBlob, profile?.displayName ?? '');

  const statusText = useUserStatusText(client, userId);
  const openStatusDialog = useSetAtom(customStatusDialogOpenAtom);

  const presenceOverride = useAtomValue(presenceOverrideAtom);
  const presenceVisible = useAtomValue(presenceVisibleAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const syncReady = useSyncReady();
  const presenceMenu = usePresenceMenu();

  const [editingName, setEditingName] = useState<string | null>(null);
  const [uploading, setUploading] = useState<'avatar' | 'banner' | null>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const bannerInput = useRef<HTMLInputElement>(null);
  const avatarBtn = useRef<HTMLButtonElement>(null);

  if (!client || !profile || !userId) return null;

  const run = async (task: () => Promise<unknown>) => {
    try {
      await task();
    } catch (err) {
      toast.error(t('common.saveFailed', { error: getErrorMessage(err) }));
    }
  };

  const uploadAvatar = (file: File | undefined) => {
    if (!file) return;
    setUploading('avatar');
    void run(() => saveProfile({ avatarFile: file })).finally(() => setUploading(null));
  };
  const uploadBanner = (file: File | undefined) => {
    if (!file) return;
    setUploading('banner');
    void run(() => saveBanner({ userId, file })).finally(() => setUploading(null));
  };

  const avatarMenu = () =>
    openContextMenuAt(
      [
        {
          label: t('settings.profile.changeAvatar'),
          icon: <ImageIcon size={16} />,
          onClick: () => avatarInput.current?.click(),
        },
        ...(profile.avatarUrl
          ? [
              {
                label: t('common.removeAvatar'),
                icon: <TrashIcon size={16} />,
                danger: true,
                onClick: async () => {
                  const ok = await confirmDialog({
                    title: t('common.removeAvatar'),
                    message: t('common.removeAvatarConfirm'),
                    danger: true,
                  });
                  if (ok) void run(removeAvatar);
                },
              },
            ]
          : []),
      ],
      anchorFromElement(avatarBtn.current),
      avatarBtn.current
    );

  const bannerMenu = (el: HTMLElement) =>
    openContextMenuAt(
      [
        {
          label: t('settings.profile.changeBanner'),
          icon: <ImageIcon size={16} />,
          onClick: () => bannerInput.current?.click(),
        },
        ...(banner?.mxc
          ? [
              {
                label: t('profile.removeBanner'),
                icon: <TrashIcon size={16} />,
                danger: true,
                onClick: async () => {
                  const ok = await confirmDialog({
                    title: t('profile.removeBanner'),
                    message: t('profile.removeBannerConfirm'),
                    danger: true,
                  });
                  if (ok) void run(() => removeBanner({ userId }));
                },
              },
            ]
          : []),
      ],
      { ...anchorFromElement(el), placement: 'bottom-end' },
      el
    );

  const commitName = () => {
    if (editingName === null) return;
    const next = editingName.trim();
    setEditingName(null);
    if (next && next !== profile.displayName) void run(() => saveProfile({ displayName: next }));
  };

  const presence =
    presenceVisible && syncReady
      ? presenceOverride === 'auto'
        ? (ownPresence ?? 'online')
        : presenceOverride
      : undefined;

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.profile.title')}</h2>

      <div className={css.card}>
        <div className={css.banner}>
          {banner?.mxc && bannerSrc ? (
            <img src={bannerSrc} alt="" className={css.bannerImg} />
          ) : banner?.mxc ? (
            <div className={css.bannerNeutral} />
          ) : (
            <div className={css.bannerFill} style={{ background: bannerGradient }} />
          )}
          <Tooltip content={t('settings.profile.editBanner')}>
            <button
              type="button"
              className={css.bannerEdit}
              aria-label={t('settings.profile.editBanner')}
              aria-haspopup="menu"
              disabled={uploading === 'banner'}
              onClick={(e) => bannerMenu(e.currentTarget)}
            >
              <PencilSimpleIcon size={18} weight="fill" />
            </button>
          </Tooltip>
        </div>

        <div className={css.head}>
          <div className={css.avatarRing}>
            <button
              ref={avatarBtn}
              type="button"
              className={css.avatarBtn}
              aria-label={t('settings.profile.editAvatar')}
              aria-haspopup="menu"
              disabled={uploading === 'avatar'}
              onClick={avatarMenu}
            >
              <Avatar
                name={profile.displayName}
                mxcUrl={profile.avatarUrl}
                client={client}
                size="fill"
                placeholder="logo"
              />
              <span className={css.avatarOverlay}>
                <PencilSimpleIcon size={26} weight="fill" />
              </span>
            </button>
            {presence && (
              <Tooltip content={t('presence.changeStatus')}>
                <button
                  type="button"
                  className={css.presenceDot}
                  aria-label={t('presence.changeStatus')}
                  aria-haspopup="menu"
                  onClick={(e) =>
                    openContextMenuAt(
                      presenceMenu(),
                      anchorFromElement(e.currentTarget),
                      e.currentTarget
                    )
                  }
                >
                  <PresenceDot state={presence} size={20} />
                </button>
              </Tooltip>
            )}
          </div>

          <div className={css.statusSlot}>
            <button
              type="button"
              className={statusText ? popupCss.statusButton : popupCss.statusButtonEmpty}
              onClick={() => openStatusDialog(true)}
            >
              {statusText ? (
                <span className={popupCss.statusText}>{statusText}</span>
              ) : (
                <>
                  <PlusCircleIcon size={14} weight="fill" />
                  {t('status.addStatus')}
                </>
              )}
            </button>
          </div>
        </div>

        <div className={css.identity}>
          {editingName !== null ? (
            <input
              className={css.nameInput}
              value={editingName}
              aria-label={t('settings.account.displayName')}
              placeholder={t('settings.account.displayNamePlaceholder')}
              autoFocus
              onChange={(e) => setEditingName(e.target.value)}
              onBlur={commitName}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitName();
                if (e.key === 'Escape') {
                  e.stopPropagation();
                  setEditingName(null);
                }
              }}
            />
          ) : (
            <Tooltip content={t('settings.profile.editName')}>
              <button
                type="button"
                className={css.nameBtn}
                onClick={() => setEditingName(profile.displayName)}
              >
                <span className={css.name}>{profile.displayName}</span>
                <PencilSimpleIcon size={16} className={css.namePen} />
              </button>
            </Tooltip>
          )}
          <div className={css.userIdRow}>
            <span className={css.userId}>{userId}</span>
            <CopyButton text={userId} size="xs" />
          </div>
        </div>
      </div>

      <input
        ref={avatarInput}
        type="file"
        accept="image/*"
        className={css.hiddenInput}
        onChange={(e) => {
          uploadAvatar(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
      <input
        ref={bannerInput}
        type="file"
        accept="image/*"
        className={css.hiddenInput}
        onChange={(e) => {
          uploadBanner(e.target.files?.[0]);
          e.target.value = '';
        }}
      />
    </div>
  );
}
