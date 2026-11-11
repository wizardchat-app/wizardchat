import { atom } from 'jotai';
import { callUiAtom } from './call';
import { streamerModeAtom } from './settings';

export const streamerModeActiveAtom = atom((get) => {
  const mode = get(streamerModeAtom);
  return mode === 'always' || (mode === 'screenshare' && get(callUiAtom).isScreenSharing);
});
