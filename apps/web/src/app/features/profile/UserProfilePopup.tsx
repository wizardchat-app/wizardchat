import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useAtom, useAtomValue, useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import {
  computePosition,
  autoUpdate,
  flip,
  shift,
  offset,
  type VirtualElement,
} from '@floating-ui/dom';
import {
  ChatCircleIcon,
  HardDrivesIcon,
  CheckIcon,
  XIcon,
  EraserIcon,
  SignOutIcon,
  ProhibitInsetIcon,
  CaretRightIcon,
  PlusCircleIcon,
  PencilSimpleIcon,
  LinkSimpleIcon,
  DotsThreeVerticalIcon,
  ShieldCheckIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Select } from '@/app/components/Select';
import { userProfileAtom } from '@/app/store/atoms/userProfile';
import {
  currentRoomIdAtom as roomAtom,
  sidebarViewAtom,
  promptModalAtom,
  presenceVisibleAtom,
  presenceMapAtom,
  ownPresenceAtom,
  emojiVerificationAtom,
  presenceOverrideAtom,
  settingsOpenAtom,
  settingsPageAtom,
} from '@/app/store/atoms';
import type { PresenceState } from '@/app/store/atoms';
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import { customStatusDialogOpenAtom, useUserStatusText } from '@/app/features/status/customStatus';
import {
  PresenceDot,
  usePresenceLabels,
  usePresenceMenu,
} from '@/app/features/status/usePresenceMenu';
import { useUserProfile } from '@/app/hooks/useUserProfile';
import { AccountSwitcher } from '@/app/features/settings/AccountSwitcher';
import { useSyncReady } from '@/app/hooks/useSync';
import { useConfirm } from '@/app/hooks/useConfirm';
import { useUserBanner, useUserBannerBlob } from '@/app/hooks/useUserBanner';
import { useProfile } from '@/app/hooks/useProfile';
import { useBannerGradient } from '@/app/hooks/useBannerGradient';
import { useToast } from '@/app/hooks/useToast';
import { useIgnoredUsers, useUnignoreUser } from '@/app/hooks/useIgnoredUsers';
import { startDm } from '@/app/hooks/useDms';
import { useUserVerification } from '@/app/hooks/useUserVerification';
import { startUserVerification } from '@/app/features/device/sessionVerification';
import { fetchMediaBlobUrl, useAvatarBlobUrl } from '@/app/components/Avatar';
import { getErrorMessage } from '@/util/error';
import { MediaLightbox } from '@/app/components/MediaLightbox/MediaLightbox';
import { Avatar } from '@/app/components/Avatar';
import { Button, CopyButton, IconButton } from '@/app/components/Button';
import { anchorFromElement, isMenuOpenKey, useContextMenu } from '@/app/hooks/useContextMenu';
import { contextMenuAtom } from '@/app/features/contextMenu/contextMenuAtom';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import * as css from './UserProfilePopup.css';
import { MutualRooms } from './MutualRooms';

import { makeUserPermalink } from '@/util/matrix';
import { powerLevelOf, queryKeys, useAllRooms, useMembersIn, useRoomSettings } from '@/app/data';
import { getRoleKey, getRoleLabel, getRoomCreators } from '@/app/features/room/memberRoles';

const POPUP_MARGIN = 12;

export function UserProfilePopup() {
  const { t } = useTranslation();
  const [profileState, setProfileState] = useAtom(userProfileAtom);
  const [, setCurrentRoom] = useAtom(roomAtom);
  const setSidebarView = useSetAtom(sidebarViewAtom);
  const setPrompt = useSetAtom(promptModalAtom);
  const toast = useToast();
  const navigate = useNavigate();
  const client = getMatrixClientOrNull();
  const popupRef = useRef<HTMLDivElement>(null);

  const profile = useUserProfile(profileState?.userId ?? null, profileState?.roomId);
  const myId = client?.userId();
  const queryClient = useQueryClient();
  const rooms = useAllRooms();
  const { data: roomSettings } = useRoomSettings(profileState?.roomId);
  const { data: knocking } = useMembersIn(profileState?.roomId, 'knock');
  const isOwn = profileState?.userId === myId;
  const userVerification = useUserVerification(client, isOwn ? null : profileState?.userId);
  const setEmojiModal = useSetAtom(emojiVerificationAtom);
  const [startingVerification, setStartingVerification] = useState(false);

  const { profile: ownProfile } = useProfile();
  const ownAvatarMxc =
    isOwn && ownProfile?.avatarUrl ? ownProfile.avatarUrl : (profile?.avatarMxc ?? null);

  const { banner } = useUserBanner(client, profileState?.userId ?? null);
  const { data: bannerSrc } = useUserBannerBlob(client, banner?.mxc);
  const { data: avatarBlob } = useAvatarBlobUrl(profile?.avatarMxc, client);
  const bannerGradient = useBannerGradient(avatarBlob, profile?.displayName ?? '');
  const [bannerLightboxOpen, setBannerLightboxOpen] = useState(false);

  const showPresence = useAtomValue(presenceVisibleAtom);
  const presenceMap = useAtomValue(presenceMapAtom);
  const ownPresence = useAtomValue(ownPresenceAtom);
  const syncReady = useSyncReady();
  const confirmDialog = useConfirm();

  const statusText = useUserStatusText(client, profileState?.userId, true);
  const openStatusDialog = useSetAtom(customStatusDialogOpenAtom);
  const openSettings = useSetAtom(settingsOpenAtom);
  const setSettingsPage = useSetAtom(settingsPageAtom);
  const presenceOverride = useAtomValue(presenceOverrideAtom);
  const presenceLabels = usePresenceLabels();
  const presenceMenu = usePresenceMenu();
  const presenceBtnRef = useRef<HTMLButtonElement>(null);

  const presence: PresenceState | undefined = (() => {
    if (!showPresence || !syncReady) return undefined;
    if (isOwn) return ownPresence;
    const uid = profileState?.userId;
    if (!uid) return undefined;
    return presenceMap[uid];
  })();

  const [avatarLightboxOpen, setAvatarLightboxOpen] = useState(false);
  const [avatarSrc, setAvatarSrc] = useState<string | null>(null);
  const [startingDm, setStartingDm] = useState(false);
  const [removingMessages, setRemovingMessages] = useState(false);
  const modMenuBtnRef = useRef<HTMLButtonElement>(null);
  const { openContextMenuAt } = useContextMenu();
  const contextMenu = useAtomValue(contextMenuAtom);
  const modMenuOpen = contextMenu?.opener === modMenuBtnRef.current;
  const [localPowerLevel, setLocalPowerLevel] = useState(profile?.powerLevel ?? 0);

  // Sync local power level when profile changes (e.g. different user)
  useEffect(() => {
    if (profile) setLocalPowerLevel(profile.powerLevel ?? 0);
  }, [profile]);

  const handleClose = useCallback(() => {
    setProfileState(null);
  }, [setProfileState]);

  const [approving, setApproving] = useState(false);
  const [rejecting, setRejecting] = useState(false);

  const handleApprove = useCallback(async () => {
    if (!client || !profileState) return;
    setApproving(true);
    try {
      const mx = getMatrixClient();
      await mx.acceptKnock(profileState.roomId!, profileState.userId!);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.membersIn(profileState.roomId!, 'knock'),
      });
      handleClose();
    } catch (err) {
      toast.error(t('room.members.approveFailed', { error: getErrorMessage(err) }));
    } finally {
      setApproving(false);
    }
  }, [client, profileState, handleClose, toast, t, queryClient]);

  const handleReject = useCallback(async () => {
    if (!client || !profileState) return;
    setRejecting(true);
    try {
      const mx = getMatrixClient();
      await mx.rejectKnock(profileState.roomId!, profileState.userId!);
      void queryClient.invalidateQueries({
        queryKey: queryKeys.membersIn(profileState.roomId!, 'knock'),
      });
      handleClose();
    } catch (err) {
      toast.error(t('room.members.rejectFailed', { error: getErrorMessage(err) }));
    } finally {
      setRejecting(false);
    }
  }, [client, profileState, handleClose, toast, t, queryClient]);

  const handleKick = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    handleClose();
    const reason = await new Promise<string | null>((resolve) => {
      setPrompt({
        open: true,
        title: t('room.members.kickConfirm', { name: profile.displayName }),
        message: t('common.reasonOptional'),
        defaultValue: '',
        resolve,
      });
    });
    if (reason === null) return;
    try {
      await client.kick(profileState.roomId!, profile.userId, reason || undefined);
    } catch (err) {
      toast.error(t('room.members.kickFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, handleClose, setPrompt]);

  const handleBan = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    handleClose();
    const reason = await new Promise<string | null>((resolve) => {
      setPrompt({
        open: true,
        title: t('room.members.banConfirm', { name: profile.displayName }),
        message: t('common.reasonOptional'),
        defaultValue: '',
        resolve,
      });
    });
    if (reason === null) return;
    try {
      await client.ban(profileState.roomId!, profile.userId, reason || undefined);
    } catch (err) {
      toast.error(t('room.members.banFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, handleClose, setPrompt]);

  const handleRemoveMessages = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    const roomId = profileState.roomId;
    if (!roomId) return;
    const targetUserId = profile.userId;
    const eventIds = await client.recentUserMessages(roomId, targetUserId).catch(() => []);

    const totalCount = eventIds.length;

    if (totalCount === 0) {
      toast.info(t('profile.noMessagesToRemove'));
      return;
    }

    const ok = await confirmDialog({
      title: t('profile.removeMessagesConfirmTitle', { name: profile.displayName }),
      message: t('profile.removeMessagesConfirmBody', {
        count: totalCount,
        name: profile.displayName,
      }),
      danger: true,
      confirmLabel: t('profile.removeMessagesConfirmButton', { count: totalCount }),
    });

    if (!ok) return;

    setRemovingMessages(true);
    try {
      await client.redactEvents(roomId, eventIds, null);
    } catch (err) {
      toast.error(t('profile.removeMessagesFailed', { error: getErrorMessage(err) }));
    } finally {
      setRemovingMessages(false);
    }
  }, [client, profileState, profile, toast, t, confirmDialog]);

  const ignoredUsers = useIgnoredUsers();
  const isIgnored = !!profile && ignoredUsers.includes(profile.userId);
  const unignoreUser = useUnignoreUser();

  const handleIgnore = useCallback(async () => {
    if (!client || !profileState || !profile) return;
    const targetUserId = profile.userId;

    if (isIgnored) {
      await unignoreUser(targetUserId, profile.displayName);
      return;
    }

    const ok = await confirmDialog({
      title: t('profile.ignoreUserConfirmTitle', { name: profile.displayName }),
      message: t('profile.ignoreUserConfirmBody', { name: profile.displayName }),
      danger: true,
    });
    if (!ok) return;
    try {
      await client.ignoreUser(targetUserId);

      for (const room of rooms) {
        if (!room.isInvite) continue;
        const info = await client.inviteInfo(room.id).catch(() => null);
        if (info?.inviterId === targetUserId) {
          await client.declineInvite(room.id).catch(() => {});
        }
      }
    } catch (err) {
      toast.error(t('profile.ignoreFailed', { error: getErrorMessage(err) }));
    }
  }, [client, profileState, profile, toast, t, confirmDialog, isIgnored, unignoreUser, rooms]);

  // Close on Escape
  useEffect(() => {
    if (!profileState) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [profileState, handleClose]);

  const editProfile = useCallback(() => {
    handleClose();
    setSettingsPage('profile');
    openSettings(true);
  }, [handleClose, setSettingsPage, openSettings]);

  const handleAvatarClick = useCallback(async () => {
    if (!client) return;
    if (isOwn) {
      editProfile();
      return;
    }
    if (!ownAvatarMxc) return;
    setAvatarSrc(avatarBlob ?? null);
    setAvatarLightboxOpen(true);
    const full = await fetchMediaBlobUrl(ownAvatarMxc, client);
    if (full) setAvatarSrc(full);
  }, [client, isOwn, ownAvatarMxc, avatarBlob, editProfile]);

  const handleBannerClick = useCallback(() => {
    if (banner?.mxc) setBannerLightboxOpen(true);
  }, [banner]);

  const editStatus = useCallback(() => {
    handleClose();
    openStatusDialog(true);
  }, [handleClose, openStatusDialog]);

  const handleStartDm = useCallback(async () => {
    if (!client || !profile) return;
    setStartingDm(true);
    try {
      const roomId = await startDm(profile.userId);
      setCurrentRoom(roomId);
      navigate(`/dm/${encodeURIComponent(roomId)}`);
      setSidebarView('dms');
      handleClose();
    } catch (err) {
      toast.error(t('room.dm.startFailed', { error: getErrorMessage(err) }));
    } finally {
      setStartingDm(false);
    }
  }, [client, profile, setCurrentRoom, navigate, handleClose, toast, t]);

  const handleVerifyUser = useCallback(async () => {
    if (!client || !profile) return;
    setStartingVerification(true);
    try {
      await startUserVerification(client, profile.userId, setEmojiModal);
      handleClose();
    } catch (err) {
      toast.error(t('profile.verifyUserFailed', { error: getErrorMessage(err) }));
    } finally {
      setStartingVerification(false);
    }
  }, [client, profile, setEmojiModal, handleClose, toast, t]);

  useLayoutEffect(() => {
    if (!profileState || !popupRef.current) return;
    const anchor = profileState.anchorRect;
    if (!anchor) return;
    const virtualEl: VirtualElement = {
      getBoundingClientRect: () =>
        new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height),
      getClientRects: () => [new DOMRect(anchor.left, anchor.top, anchor.width, anchor.height)],
      contextElement: undefined,
    };
    const popup = popupRef.current;
    const cleanup = autoUpdate(virtualEl, popup, () => {
      if (!popupRef.current) return;
      computePosition(virtualEl, popupRef.current, {
        placement: profileState.placement ?? 'right-start',
        strategy: 'fixed',
        middleware: [offset(POPUP_MARGIN), flip(), shift({ padding: POPUP_MARGIN })],
      }).then(({ x, y }) => {
        if (!popupRef.current) return;
        Object.assign(popupRef.current.style, {
          left: `${x}px`,
          top: `${y}px`,
          visibility: 'visible',
        });
      });
    });
    return cleanup;
  }, [profileState]);

  if (!profileState || !profile) return null;

  const isKnock =
    !!profileState.roomId && !!knocking?.some((m) => m.userId === profileState.userId);
  const myPowerLevel = powerLevelOf(roomSettings?.powerLevels, myId ?? '', roomSettings?.creators);
  const canModerate = myPowerLevel >= 50;
  const plContent = roomSettings?.powerLevels ?? {};
  const kickThreshold = plContent.kick ?? 50;
  const banThreshold = plContent.ban ?? 50;
  const targetPowerLevel = profile?.powerLevel ?? 0;
  const canKick =
    !isOwn && !isKnock && myPowerLevel >= kickThreshold && myPowerLevel > targetPowerLevel;
  const canBan =
    !isOwn && !isKnock && myPowerLevel >= banThreshold && myPowerLevel > targetPowerLevel;
  const redactThreshold = plContent.redact ?? 50;
  const canRedactAny =
    !isOwn && !isKnock && myPowerLevel >= redactThreshold && myPowerLevel > targetPowerLevel;

  const bannerClickable = !!banner?.mxc;

  const hasModActions = canRedactAny || canKick || canBan;

  const openModMenu = () => {
    const items: ContextMenuItem[] = [];
    if (canRedactAny) {
      items.push({
        label: t('profile.removeMessages'),
        icon: <EraserIcon size={14} />,
        danger: true,
        disabled: removingMessages,
        onClick: handleRemoveMessages,
      });
    }
    if (canKick) {
      items.push({
        label: t('room.members.kick'),
        icon: <SignOutIcon size={14} />,
        danger: true,
        onClick: handleKick,
      });
    }
    if (canBan) {
      items.push({
        label: t('room.members.ban'),
        icon: <ProhibitInsetIcon size={14} />,
        danger: true,
        onClick: handleBan,
      });
    }
    openContextMenuAt(items, anchorFromElement(modMenuBtnRef.current), modMenuBtnRef.current);
  };

  const roleKey = getRoleKey(
    { userId: profileState.userId, powerLevel: localPowerLevel },
    getRoomCreators(roomSettings)
  );
  const roleLabel = getRoleLabel(roleKey, t);
  const roleClass =
    roleKey === 'founder'
      ? css.roleFounder
      : localPowerLevel >= 100
        ? css.roleAdmin
        : localPowerLevel >= 50
          ? css.roleModerator
          : css.roleMember;
  const roleDotClass =
    roleKey === 'founder'
      ? css.roleFounderDot
      : localPowerLevel >= 100
        ? css.roleAdminDot
        : localPowerLevel >= 50
          ? css.roleModeratorDot
          : css.roleMemberDot;

  const rolePowerOptions = [
    { value: '100', label: t('room.members.admin') },
    { value: '50', label: t('room.members.moderator') },
    { value: '0', label: t('room.members.member') },
  ];

  const shownPresence = presenceOverride === 'auto' ? (ownPresence ?? 'online') : presenceOverride;

  const avatarNode = (
    <div className={css.avatarWrap} onClick={handleAvatarClick}>
      <Avatar
        name={profile.displayName}
        mxcUrl={ownAvatarMxc}
        client={client ?? undefined}
        size="lg"
        placeholder="logo"
        presence={presence}
      />
    </div>
  );

  return (
    <>
      <div className={css.overlay} role="presentation" onClick={handleClose} />
      <div
        ref={popupRef}
        className={css.popup}
        style={{ visibility: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          className={css.coverWrap}
          onClick={handleBannerClick}
          style={bannerClickable ? { cursor: 'pointer' } : undefined}
        >
          {banner?.mxc && bannerSrc ? (
            <img src={bannerSrc} alt="" className={css.cover} />
          ) : banner?.mxc ? (
            <div className={css.coverNeutral} />
          ) : (
            <div className={css.coverFallback} style={{ background: bannerGradient }} />
          )}
        </div>

        <div className={css.topRow}>
          <div className={css.avatarRow}>
            {isOwn || ownAvatarMxc ? (
              <Tooltip content={isOwn ? t('profile.editProfile') : t('profile.viewFullScreen')}>
                {avatarNode}
              </Tooltip>
            ) : (
              avatarNode
            )}

            {isOwn ? (
              <div className={css.statusSlot}>
                <button
                  type="button"
                  className={statusText ? css.statusButton : css.statusButtonEmpty}
                  onClick={editStatus}
                >
                  {statusText ? (
                    <span className={css.statusText}>{statusText}</span>
                  ) : (
                    <>
                      <PlusCircleIcon size={14} weight="fill" />
                      {t('status.addStatus')}
                    </>
                  )}
                </button>
              </div>
            ) : statusText ? (
              <div className={css.statusSlot}>
                <Tooltip content={statusText}>
                  <span className={css.status}>
                    <span className={css.statusText}>{statusText}</span>
                  </span>
                </Tooltip>
              </div>
            ) : (
              <div style={{ flex: 1 }} />
            )}

            <CopyButton
              text={makeUserPermalink(profile.userId)}
              size="xs"
              copyLabel={t('common.copyLink')}
              icon={<LinkSimpleIcon size={12} />}
            />

            {!isOwn && (
              <Tooltip content={isIgnored ? t('profile.unignoreUser') : t('profile.ignoreUser')}>
                <IconButton
                  size="xs"
                  danger={!isIgnored}
                  onClick={handleIgnore}
                  aria-label={isIgnored ? t('profile.unignoreUser') : t('profile.ignoreUser')}
                >
                  <ProhibitInsetIcon size={14} />
                </IconButton>
              </Tooltip>
            )}
          </div>

          <div className={css.nameSection}>
            <span className={css.displayNameRow}>
              <span className={css.displayName}>{profile.displayName}</span>
              {userVerification.verified && (
                <Tooltip content={t('common.verified')}>
                  <ShieldCheckIcon
                    size={18}
                    weight="fill"
                    className={css.verifiedBadge}
                    aria-label={t('common.verified')}
                  />
                </Tooltip>
              )}
            </span>

            <div className={css.userIdRow}>
              <span className={css.userId}>{profile.userId.split(':')[0]}</span>
              <CopyButton text={profile.userId} size="xs" />
            </div>
          </div>
        </div>

        <div className={css.infoRow}>
          <span className={css.infoIcon}>
            <HardDrivesIcon size={14} />
          </span>
          <Tooltip content={profile.homeserver}>
            <span className={css.infoValue}>{profile.homeserver}</span>
          </Tooltip>
          {profileState.roomId && !isOwn && profile.canModify && roleKey !== 'founder' ? (
            <Select
              surface="pill"
              icon={<span className={roleDotClass} />}
              value={String(localPowerLevel)}
              options={rolePowerOptions}
              aria-label={t('room.members.role')}
              onChange={async (next) => {
                if (!client || !profileState.roomId || !profile) return;
                const newLevel = Number(next);
                const newLabel = rolePowerOptions.find((o) => o.value === next)?.label ?? roleLabel;
                const prevLevel = localPowerLevel;
                setLocalPowerLevel(newLevel);
                try {
                  await client.setPowerLevel(profileState.roomId, profile.userId, newLevel);
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.members(profileState.roomId),
                  });
                  void queryClient.invalidateQueries({
                    queryKey: queryKeys.roomSettings(profileState.roomId),
                  });
                  toast.success(
                    t('room.settings.members.permissionsApplySuccess', {
                      name: profile.displayName,
                      level: newLabel,
                    })
                  );
                } catch (err) {
                  toast.error(
                    t('room.settings.permissions.saveFailed', {
                      error: getErrorMessage(err),
                    })
                  );
                  setLocalPowerLevel(prevLevel);
                }
              }}
            />
          ) : (
            profileState.roomId && (
              <span className={roleClass}>
                <span className={roleDotClass} />
                {roleLabel}
              </span>
            )
          )}
        </div>

        {!isOwn && client && (
          <MutualRooms client={client} userId={profile.userId} onOpen={handleClose} />
        )}

        {isOwn && (
          <div className={css.ownMenu}>
            <button type="button" className={css.ownMenuItem} onClick={editProfile}>
              <PencilSimpleIcon size={18} className={css.ownMenuIcon} />
              <span className={css.ownMenuLabel}>{t('profile.editProfile')}</span>
            </button>
            <button
              ref={presenceBtnRef}
              type="button"
              className={css.ownMenuItem}
              aria-haspopup="menu"
              onClick={() =>
                openContextMenuAt(
                  presenceMenu(),
                  { ...anchorFromElement(presenceBtnRef.current), placement: 'right-start' },
                  presenceBtnRef.current
                )
              }
            >
              <span className={css.ownMenuIcon}>
                <PresenceDot state={shownPresence} size={12} />
              </span>
              <span className={css.ownMenuLabel}>{presenceLabels[shownPresence]}</span>
              {presenceOverride === 'auto' && (
                <span className={css.ownMenuHint}>{presenceLabels.auto}</span>
              )}
              <CaretRightIcon size={16} className={css.ownMenuCaret} />
            </button>
          </div>
        )}

        {isOwn && profileState.source === 'userpanel' && (
          <div className={css.accountSwitcherSlot}>
            <AccountSwitcher
              onAddAccount={() => {
                handleClose();
                navigate('/welcome?add=1');
              }}
            />
          </div>
        )}
        {isKnock && canModerate && (
          <div className={css.modActions}>
            <Button
              variant="secondary"
              className={css.modActionBtn}
              loading={rejecting}
              onClick={handleReject}
            >
              <XIcon size={16} />
              {t('room.members.reject')}
            </Button>
            <Button
              variant="primary"
              className={css.modActionBtn}
              loading={approving}
              onClick={handleApprove}
            >
              <CheckIcon size={16} />
              {t('room.members.approve')}
            </Button>
          </div>
        )}

        {!isOwn && profileState.roomId && (
          <div className={css.primaryRow}>
            <Button
              variant="primary"
              className={css.primaryBtn}
              loading={startingDm}
              onClick={handleStartDm}
            >
              <ChatCircleIcon size={16} />
              {t('profile.message')}
            </Button>
            {userVerification.canVerify && !userVerification.verified && (
              <IconButton
                size="md"
                tooltip={t('verification.verifyUser')}
                aria-label={t('verification.verifyUser')}
                disabled={startingVerification}
                onClick={handleVerifyUser}
              >
                <ShieldCheckIcon size={18} />
              </IconButton>
            )}
            {hasModActions && (
              <IconButton
                ref={modMenuBtnRef}
                size="md"
                aria-label={t('common.more')}
                aria-haspopup="menu"
                aria-expanded={modMenuOpen}
                onClick={openModMenu}
                onKeyDown={(e) => {
                  if (!isMenuOpenKey(e)) return;
                  e.preventDefault();
                  e.stopPropagation();
                  openModMenu();
                }}
              >
                <DotsThreeVerticalIcon size={18} />
              </IconButton>
            )}
          </div>
        )}
      </div>

      {avatarLightboxOpen && (
        <MediaLightbox
          src={avatarSrc ?? undefined}
          name={profile.displayName}
          client={client}
          avatarMxc={ownAvatarMxc}
          onClose={() => setAvatarLightboxOpen(false)}
        />
      )}

      {bannerLightboxOpen && (
        <MediaLightbox
          src={bannerSrc ?? undefined}
          name={profile.displayName}
          client={client}
          avatarMxc={ownAvatarMxc}
          onClose={() => setBannerLightboxOpen(false)}
        />
      )}
    </>
  );
}
