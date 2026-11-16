import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useAtomValue, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { Tooltip } from '@/app/components/Tooltip';
import type { WizardClient } from '@wizardchat/core';
import { ArrowSquareInIcon, SpeakerHighIcon, XIcon } from '@phosphor-icons/react';
import {
  callActionsAtom,
  callEffectiveViewAtom,
  callIsVoiceRoomAtom,
  callUiAtom,
  callSessionAtom,
} from '@/app/store/atoms/call';
import type { CallPresentation, CallView } from '@/app/store/atoms/call';
import { useRoom } from '@/app/data';
import { useCallContainer } from '@/app/features/calls/CallContainer';
import { useIncomingCall } from './useIncomingCall';
import { IncomingCallOverlay } from './IncomingCallOverlay';
import { CallControlBar } from './CallControlBar';
import { CallStage } from './stage/CallStage';
import { WatchPlayerHost } from './watchTogether/WatchStage';
import { useReturnToCall } from './useReturnToCall';
import * as css from './CallLayer.css';
import { DOCKED_HEADER_HEIGHT } from './CallLayer.css';

interface Props {
  client: WizardClient | null;
}

const DEFAULT_DOCKED_HEIGHT = 360;
const RATIO_W_TO_H = 16 / 9;
const MIN_DOCKED_HEIGHT = 280;
const MAX_DOCKED_HEIGHT_FRACTION = 0.5;

const SNAP_FULLSCREEN_OVERDRAG_PX = 48;
const SNAP_ANIMATION_MS = 160;

function computeDockedDefaultHeight(el: HTMLElement): number {
  const width = el.clientWidth;
  if (width <= 0) return DEFAULT_DOCKED_HEIGHT;
  return Math.max(
    MIN_DOCKED_HEIGHT,
    Math.min(width / RATIO_W_TO_H, Math.round(window.innerHeight * MAX_DOCKED_HEIGHT_FRACTION))
  );
}

const PIP_W = 420;
const PIP_H = 270;
const PIP_BOTTOM = 88;
const PIP_RIGHT = 24;

export function CallLayer({ client }: Props) {
  const ui = useAtomValue(callUiAtom);
  const setUi = useSetAtom(callUiAtom);
  const { containerRef } = useCallContainer();

  const { accept, decline } = useIncomingCall(client);

  const inCall = ui.roomId !== null;
  const { t } = useTranslation();
  const view = useAtomValue(callEffectiveViewAtom);
  const returnToCall = useReturnToCall();
  const isVoiceRoomCall = useAtomValue(callIsVoiceRoomAtom);
  const isHidden = view === 'hidden';
  const isPip = view === 'tile';
  const isFullscreen = view === 'fullscreen';
  const isDocked = view === 'docked';

  const joined = ui.phase === 'joined';
  const callSession = useAtomValue(callSessionAtom);
  const callRoom = useRoom(callSession?.roomId);
  const roomName = callRoom?.name ?? ui.roomId ?? '';

  const [containerEl, setContainerEl] = useState<HTMLDivElement | null>(null);
  const [dockedHeight, setDockedHeight] = useState(DEFAULT_DOCKED_HEIGHT);
  const [isDragging, setIsDragging] = useState(false);
  const [snapFullscreen, setSnapFullscreen] = useState(false);
  const callActions = useAtomValue(callActionsAtom);

  const pipPosRef = useRef<{ x: number; y: number } | null>(null);
  const cancelCollapseRef = useRef<(() => void) | null>(null);
  const defaultHeightRef = useRef<number | null>(null);
  const userResizedRef = useRef(false);
  const lastViewRef = useRef<CallView>('hidden');
  const cancelSnapRef = useRef<(() => void) | null>(null);
  const draggingRef = useRef(false);

  // Grab the container element once mounted so we can portal chrome into it.
  useEffect(() => {
    setContainerEl(containerRef.current);
  }, [containerRef]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Cancel any pending collapse so a re-join expands cleanly from 0.
    cancelCollapseRef.current?.();
    cancelCollapseRef.current = null;

    const previousView = lastViewRef.current;
    lastViewRef.current = view;
    const instant =
      previousView !== view &&
      [previousView, view].some((v) => v === 'hidden' || v === 'fullscreen');
    const pendingSnap = cancelSnapRef.current;
    cancelSnapRef.current = null;
    if (instant) {
      el.style.transition = 'none';
      const restore = () => {
        cancelSnapRef.current = null;
        if (draggingRef.current) return;
        el.style.transition = '';
      };
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(restore);
      });
      cancelSnapRef.current = () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    } else if (pendingSnap && !draggingRef.current) {
      el.style.transition = '';
    }

    if (!inCall) {
      el.classList.add(css.containerActive);
      el.classList.remove(css.pip, css.fullscreen);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '0px';
      el.style.paddingTop = '0px';

      let cancelled = false;
      const timer = window.setTimeout(() => {
        if (cancelled) return;
        el.classList.remove(css.containerActive, css.pip, css.fullscreen);
        cancelCollapseRef.current = null;
      }, 320);
      cancelCollapseRef.current = () => {
        cancelled = true;
        window.clearTimeout(timer);
      };
      return;
    }

    if (isHidden) {
      el.classList.remove(css.containerActive, css.fullscreen);
      el.classList.add(css.pip);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '';
      el.style.paddingTop = '0px';
      return;
    }

    el.classList.add(css.containerActive);
    if (isFullscreen) {
      el.classList.remove(css.pip);
      el.classList.add(css.fullscreen);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.height = '';
      el.style.paddingTop = '0px';
    } else if (isPip) {
      el.classList.remove(css.fullscreen);
      el.classList.add(css.pip);
      el.style.height = '';
      el.style.paddingTop = '0px';
      const pos = pipPosRef.current ?? {
        x: window.innerWidth - PIP_W - PIP_RIGHT,
        y: window.innerHeight - PIP_H - PIP_BOTTOM,
      };
      pipPosRef.current = pos;
      el.style.left = `${pos.x}px`;
      el.style.top = `${pos.y}px`;
      el.style.right = 'auto';
      el.style.bottom = 'auto';
    } else {
      el.classList.remove(css.pip, css.fullscreen);
      el.style.left = '';
      el.style.top = '';
      el.style.right = '';
      el.style.bottom = '';
      el.style.paddingTop = `${DOCKED_HEADER_HEIGHT}px`;
      if (defaultHeightRef.current === null) {
        defaultHeightRef.current = computeDockedDefaultHeight(el);
      }
      const targetHeight = userResizedRef.current ? dockedHeight : defaultHeightRef.current;
      el.style.height = `${targetHeight}px`;
      if (dockedHeight !== targetHeight) setDockedHeight(targetHeight);
    }
  }, [inCall, view, isHidden, isPip, isFullscreen, dockedHeight, containerRef]);

  useEffect(() => {
    return () => {
      cancelCollapseRef.current?.();
      cancelSnapRef.current?.();
    };
  }, []);

  const showPresentation = useCallback(
    (next: CallPresentation) => {
      setUi((prev) => ({ ...prev, presentation: next }));
    },
    [setUi]
  );

  useEffect(() => {
    if (!isFullscreen || isVoiceRoomCall) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (
        target?.closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"], [role="listbox"]'
        )
      ) {
        return;
      }
      if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return;
      showPresentation('room');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen, isVoiceRoomCall, showPresentation]);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent) => {
      if (view !== 'docked') return;
      e.preventDefault();
      userResizedRef.current = true;
      setIsDragging(true);
      const el = containerRef.current;
      if (el) el.style.transition = 'none';
      draggingRef.current = true;
      const startY = e.clientY;
      const startHeight = dockedHeight;
      const maxHeight = window.innerHeight * 0.8;
      let snapping = false;
      const handleMouseMove = (ev: MouseEvent) => {
        const raw = startHeight + ev.clientY - startY;
        const snap = raw > maxHeight + SNAP_FULLSCREEN_OVERDRAG_PX;
        if (snap !== snapping) {
          snapping = snap;
          setSnapFullscreen(snap);
          if (el) el.style.transition = snap ? `height ${SNAP_ANIMATION_MS}ms ease` : 'none';
        }
        const available = el?.parentElement?.clientHeight ?? window.innerHeight;
        setDockedHeight(snap ? available : Math.max(120, Math.min(raw, maxHeight)));
      };
      const handleMouseUp = () => {
        setIsDragging(false);
        setSnapFullscreen(false);
        draggingRef.current = false;
        if (el) el.style.transition = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        if (snapping) {
          setDockedHeight(startHeight);
          callActions?.setPresentation('fullscreen');
        }
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [dockedHeight, view, containerRef, callActions]
  );

  const handlePipDragStart = useCallback(
    (e: React.MouseEvent) => {
      if (!isPip) return;
      e.preventDefault();
      const el = containerRef.current;
      if (!el) return;
      const startX = e.clientX;
      const startY = e.clientY;
      const startPos = pipPosRef.current ?? {
        x: window.innerWidth - PIP_W - PIP_RIGHT,
        y: window.innerHeight - PIP_H - PIP_BOTTOM,
      };
      pipPosRef.current = startPos;
      const handleMouseMove = (ev: MouseEvent) => {
        const x = Math.max(
          0,
          Math.min(ev.clientX - (startX - startPos.x), window.innerWidth - PIP_W)
        );
        const y = Math.max(
          0,
          Math.min(ev.clientY - (startY - startPos.y), window.innerHeight - PIP_H)
        );
        pipPosRef.current = { x, y };
        el.style.left = `${x}px`;
        el.style.top = `${y}px`;
      };
      const handleMouseUp = () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    },
    [isPip, containerRef]
  );

  return (
    <>
      {isDocked &&
        containerEl &&
        createPortal(
          <div className={css.header}>
            <span className={css.headerTitle}>
              <SpeakerHighIcon size={14} className={css.headerIcon} />
              {roomName}
            </span>
          </div>,
          containerEl
        )}

      {isPip &&
        containerEl &&
        createPortal(
          <div className={css.pipNav} onMouseDown={handlePipDragStart}>
            <span className={css.pipNavTitle}>
              <SpeakerHighIcon size={14} />
              {roomName}
            </span>
            <Tooltip content={t('call.returnToCall')}>
              <button
                type="button"
                className={css.pipNavBtn}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={returnToCall}
                aria-label={t('call.returnToCall')}
              >
                <ArrowSquareInIcon size={18} />
              </button>
            </Tooltip>
            <Tooltip content={t('common.close')}>
              <button
                type="button"
                className={css.pipNavBtn}
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => callActions?.setPresentation('room')}
                aria-label={t('common.close')}
              >
                <XIcon size={18} />
              </button>
            </Tooltip>
          </div>,
          containerEl
        )}

      {isDocked &&
        containerEl &&
        createPortal(
          <>
            {isDragging && <div className={css.dragOverlay} />}
            {snapFullscreen && <div className={css.snapHint} />}
            <div
              className={css.resizeBar}
              onMouseDown={handleResizeStart}
              style={{ transition: isDragging ? 'none' : undefined }}
            />
          </>,
          containerEl
        )}

      {inCall &&
        callSession &&
        !isHidden &&
        containerEl &&
        createPortal(<CallStage />, containerEl)}

      {inCall &&
        callSession &&
        containerEl &&
        createPortal(
          <WatchPlayerHost roomId={callSession.roomId} rootRef={containerRef} />,
          containerEl
        )}

      {inCall &&
        joined &&
        !isHidden &&
        containerEl &&
        createPortal(<CallControlBar />, containerEl)}

      {ui.incoming && client && (
        <IncomingCallOverlay
          callerName={ui.incoming.callerName}
          callerId={ui.incoming.callerId}
          voiceOnly={ui.incoming.voiceOnly}
          roomName={ui.incoming.roomName}
          client={client}
          onAccept={() => accept(ui.incoming!)}
          onDecline={decline}
        />
      )}
    </>
  );
}
