import { useAtom, useSetAtom } from 'jotai';
import { DEFAULT_KEYBINDS, globalKeyStatusAtom, keybindsAtom } from '@/app/store/atoms';
import {
  keybindCapture,
  matchesComboDown,
  parseCombo,
} from '@/app/features/keyboardShortcuts/keyCombo';
import { useEffect, useCallback, useRef } from 'react';

const ACTIONS = ['toggleMute', 'toggleDeafen', 'toggleScreenShare', 'toggleCamera'] as const;
type Action = (typeof ACTIONS)[number];

const isAction = (id: string): id is Action => (ACTIONS as readonly string[]).includes(id);
const capturingKeybind = (target: EventTarget | null) =>
  !!(target as Element | null)?.classList?.contains('keybind-input');

export function useVoiceKeybinds(
  isInVoiceCall: boolean,
  handlers: {
    toggleMute: () => void;
    toggleDeafen: () => void;
    toggleScreenShare: () => void;
    toggleCamera: () => void;
  }
) {
  const [keybinds] = useAtom(keybindsAtom);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const global = useRef(new Set<Action>());
  const setStatus = useSetAtom(globalKeyStatusAtom);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isInVoiceCall) return;
      if (capturingKeybind(e.target)) return;
      if (e.repeat) return;
      const action = ACTIONS.find((a) =>
        matchesComboDown(e, parseCombo(keybinds[a] ?? DEFAULT_KEYBINDS[a] ?? ''))
      );
      if (!action) return;
      e.preventDefault();
      if (!global.current.has(action)) handlersRef.current[action]();
    },
    [isInVoiceCall, keybinds]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  const { toggleMute, toggleDeafen } = keybinds;
  const toggleScreenShare = keybinds.toggleScreenShare ?? DEFAULT_KEYBINDS.toggleScreenShare ?? '';
  const toggleCamera = keybinds.toggleCamera ?? DEFAULT_KEYBINDS.toggleCamera ?? '';
  useEffect(() => {
    const desktop = window.desktopAPI;
    if (!isInVoiceCall || !desktop?.setGlobalKey || !desktop.onGlobalKey) return;
    const codes: Record<Action, string> = {
      toggleMute,
      toggleDeafen,
      toggleScreenShare,
      toggleCamera,
    };
    const active = global.current;
    let cancelled = false;
    const stop = desktop.onGlobalKey((id, down) => {
      if (down && isAction(id) && !keybindCapture.active) handlersRef.current[id]();
    });
    for (const action of ACTIONS) {
      void desktop.setGlobalKey(action, codes[action] || null).then((status) => {
        if (cancelled || !codes[action]) return;
        if (status === 'active' || status === 'taken') active.add(action);
        setStatus((prev) => ({ ...prev, [action]: status }));
      });
    }
    return () => {
      cancelled = true;
      stop();
      for (const action of ACTIONS) {
        active.delete(action);
        void desktop.setGlobalKey?.(action, null);
      }
      setStatus((prev) => {
        const next = { ...prev };
        for (const action of ACTIONS) delete next[action];
        return next;
      });
    };
  }, [isInVoiceCall, toggleMute, toggleDeafen, toggleScreenShare, toggleCamera, setStatus]);
}
