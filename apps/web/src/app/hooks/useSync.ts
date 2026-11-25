import { useAtomValue } from 'jotai';
import { syncReadyAtom } from '@/app/data/atoms';

export function useSyncReady(): boolean {
  return useAtomValue(syncReadyAtom);
}
