import { useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { RoomSummary, SpaceNode, WizardClient } from '@wizardchat/core';
import { currentRoomIdAtom, pendingEventJumpAtom, userProfileAtom } from '@/app/store/atoms';
import { STORAGE_KEY_PENDING_LINK } from '@/const/storageKeys';
import { parseMatrixToFragment, parseMatrixToUrl, type MatrixToTarget } from '@/util/matrixTo';
import { useAllRooms, useSpaceGraph } from '@/app/data';
import { getErrorMessage } from '@/util/error';
import { startDm } from './useDms';
import { useConfirm } from './useConfirm';
import { useSyncReady } from './useSync';
import { useToast } from './useToast';

function roomPath(roomId: string, isSpace: boolean, isDirect: boolean): string {
  const id = encodeURIComponent(roomId);
  if (isSpace) return `/space/${id}`;
  return isDirect ? `/dm/${id}` : `/r/${id}`;
}

function existingDmRoomId(rooms: RoomSummary[], userId: string): string | null {
  return rooms.find((r) => r.isDirect && !r.isInvite && r.dmUserId === userId)?.id ?? null;
}

export function useMatrixToLinks(client: WizardClient | null): void {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const syncReady = useSyncReady();
  const currentRoomId = useAtomValue(currentRoomIdAtom);
  const setProfile = useSetAtom(userProfileAtom);
  const setPendingJump = useSetAtom(pendingEventJumpAtom);
  const rooms = useAllRooms();
  const graph = useSpaceGraph();
  const roomsRef = useRef<RoomSummary[]>(rooms);
  roomsRef.current = rooms;
  const graphRef = useRef<SpaceNode[]>(graph);
  graphRef.current = graph;

  const open = useCallback(
    async (target: MatrixToTarget, anchor?: Element) => {
      if (!client) return;
      try {
        if (target.kind === 'user') {
          if (target.userId === client.userId()) return;
          if (anchor) {
            const rect = anchor.getBoundingClientRect();
            setProfile({
              userId: target.userId,
              roomId: currentRoomId,
              anchorRect: {
                top: rect.top,
                left: rect.left,
                width: rect.width,
                height: rect.height,
              },
            });
            return;
          }
          let roomId = existingDmRoomId(roomsRef.current, target.userId);
          if (!roomId) {
            const ok = await confirm({
              title: t('link.startDmTitle'),
              message: t('link.startDmMessage', { user: target.userId }),
              confirmLabel: t('link.startDm'),
            });
            if (!ok) return;
            roomId = await startDm(target.userId);
          }
          navigate(`/dm/${encodeURIComponent(roomId)}`);
          return;
        }

        const { roomIdOrAlias, viaServers, eventId } = target;
        const resolved = roomIdOrAlias.startsWith('#')
          ? await client.resolveAlias(roomIdOrAlias).catch(() => null)
          : null;
        const targetId = resolved?.roomId ?? roomIdOrAlias;
        const via = viaServers.length > 0 ? viaServers : (resolved?.servers ?? []);
        const joinedRooms = roomsRef.current.filter((r) => !r.isInvite);
        const joinedSpaceIds = new Set(graphRef.current.map((s) => s.spaceId));
        const room: RoomSummary | null =
          joinedRooms.find(
            (r) => r.id === targetId || (!resolved && r.canonicalAlias === roomIdOrAlias)
          ) ?? null;
        let roomId = room?.id ?? (joinedSpaceIds.has(targetId) ? targetId : null);
        let isSpace = !!roomId && joinedSpaceIds.has(roomId);
        let isDirect = !!room?.isDirect;

        if (!roomId) {
          const known = roomsRef.current.find((r) => r.id === targetId);
          const ok = await confirm({
            title: known?.isSpace ? t('link.joinSpaceTitle') : t('link.joinTitle'),
            message: t('link.joinMessage', { room: known?.name || roomIdOrAlias }),
            confirmLabel: t('common.join'),
          });
          if (!ok) return;
          roomId = await client.join(
            resolved ? targetId : roomIdOrAlias,
            via.length > 0 ? via : null
          );
          const details = await client.roomDetails(roomId).catch(() => null);
          isSpace = !!details?.isSpace;
          isDirect = !!details?.isDirect;
        }

        navigate(roomPath(roomId, isSpace, isDirect));
        if (eventId) setPendingJump({ roomId, eventId });
      } catch (err) {
        toast.error(t('link.failed', { error: getErrorMessage(err) }));
      }
    },
    [client, confirm, currentRoomId, navigate, setPendingJump, setProfile, t, toast]
  );

  useEffect(() => {
    if (!client || !syncReady) return;
    const fragment = sessionStorage.getItem(STORAGE_KEY_PENDING_LINK);
    if (!fragment) return;
    sessionStorage.removeItem(STORAGE_KEY_PENDING_LINK);
    const target = parseMatrixToFragment(fragment);
    if (target) void open(target);
  }, [client, syncReady, open]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey)
        return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!anchor) return;
      const target = parseMatrixToUrl((anchor as HTMLAnchorElement).href);
      if (!target) return;
      e.preventDefault();
      void open(target, anchor);
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [open]);
}
