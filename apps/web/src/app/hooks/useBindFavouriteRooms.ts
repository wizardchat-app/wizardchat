import { useEffect } from 'react';
import { useSetAtom } from 'jotai';
import type { RoomSummary } from '@wizardchat/core';
import { favouriteRoomsAtom } from '@/app/store/atoms';
import { useAllRooms } from '@/app/data';

export function roomIsFavourite(room: RoomSummary | null | undefined): boolean {
  return !!room?.isFavourite;
}

/** Keeps the favourite room ids in sync with the rooms' tags */
export function useBindFavouriteRooms(): void {
  const setFavourites = useSetAtom(favouriteRoomsAtom);
  const rooms = useAllRooms();
  const key = rooms
    .filter(roomIsFavourite)
    .map((r) => r.id)
    .sort()
    .join('|');
  useEffect(() => {
    setFavourites(new Set(key ? key.split('|') : []));
  }, [key, setFavourites]);
}
