import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import { useQueryClient } from '@tanstack/react-query';
import type { WizardClient } from '@wizardchat/core';
import { applyDiffs } from '@/core/listDiff';
import { invalidateImagePacks } from '@/app/hooks/useUserPacks';
import {
  roomSectionOrderAtom,
  roomSectionsAtom,
  roomsAtom,
  roomTagNamesAtom,
  spaceGraphAtom,
  spacesAtom,
  syncReadyAtom,
  syncStateAtom,
} from './atoms';

/** Which cached queries a state event type makes stale */
function staleQueries(roomId: string, eventType: string): unknown[][] {
  const keys: unknown[][] = [['roomSettings', roomId]];
  if (eventType === 'm.room.member') {
    keys.push(['members', roomId], ['membersIn', roomId]);
  }
  if (eventType === 'm.room.power_levels') keys.push(['members', roomId]);
  if (eventType === 'm.widget' || eventType === 'im.vector.modular.widgets')
    keys.push(['widgets', roomId]);
  if (eventType === 'm.space.child') keys.push(['spaceChildren', roomId]);
  return keys;
}

/** Mirrors the core's live room list, spaces, sections and sync state into atoms */
export function DataSync({ client }: { client: WizardClient }) {
  const setRooms = useSetAtom(roomsAtom);
  const setSpaces = useSetAtom(spacesAtom);
  const setGraph = useSetAtom(spaceGraphAtom);
  const setSyncState = useSetAtom(syncStateAtom);
  const setReady = useSetAtom(syncReadyAtom);
  const setSections = useSetAtom(roomSectionsAtom);
  const setSectionOrder = useSetAtom(roomSectionOrderAtom);
  const setTagNames = useSetAtom(roomTagNamesAtom);
  const queryClient = useQueryClient();

  useEffect(() => {
    let graphTimer: ReturnType<typeof setTimeout> | undefined;
    // The space graph comes from local state; refresh it shortly after rooms or spaces change
    const refreshGraph = () => {
      clearTimeout(graphTimer);
      graphTimer = setTimeout(
        () =>
          void client
            .spaceGraph()
            .then(setGraph)
            .catch(() => {}),
        150
      );
    };
    const subscriptions = [
      client.watchSyncState(setSyncState),
      client.watchLoadState((state) => {
        if (state !== 'loading') setReady(true);
      }),
      client.watchSpaces((diffs) => {
        setSpaces((spaces) => applyDiffs(spaces, diffs));
        refreshGraph();
      }),
      client.watchRooms(5000, (diffs) => {
        setRooms((rooms) => applyDiffs(rooms, diffs));
        refreshGraph();
      }),
      client.watchRoomSections(setSections),
      client.watchRoomSectionOrder(setSectionOrder),
      client.watchRoomAccountData('m.tag', (pairs) =>
        setTagNames(
          new Map(
            pairs.map(([roomId, content]) => [
              roomId,
              Object.keys((content as { tags?: Record<string, unknown> } | null)?.tags ?? {}),
            ])
          )
        )
      ),
      client.watchStateChanges(({ roomId, eventType }) => {
        for (const queryKey of staleQueries(roomId, eventType))
          void queryClient.invalidateQueries({ queryKey });
        if (/^(im\.ponies\.room_emotes|m\.room\.image_pack|m\.space\.parent)$/.test(eventType))
          invalidateImagePacks();
        window.dispatchEvent(
          new CustomEvent('wizardchat:state', { detail: { roomId, eventType } })
        );
      }),
    ];
    return () => {
      clearTimeout(graphTimer);
      subscriptions.forEach((s) => s.cancel());
    };
  }, [
    client,
    setRooms,
    setSpaces,
    setGraph,
    setSyncState,
    setReady,
    setSections,
    setSectionOrder,
    setTagNames,
    queryClient,
  ]);

  return null;
}
