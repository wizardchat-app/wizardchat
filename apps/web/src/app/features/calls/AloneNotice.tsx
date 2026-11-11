import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useAtomValue } from 'jotai';
import { callEffectiveViewAtom } from '@/app/store/atoms/call';
import { useCallContainer } from './CallContainer';
import type { CallMedia } from '@/call/media';
import { useRoom } from '@/app/data';
import { Button } from '@/app/components/Button';
import { useCallSnapshot } from './stage/useCallSnapshot';
import * as css from './AloneNotice.css';

const ALONE_GRACE_MS = 10_000;
const ALONE_COUNTDOWN_S = 60;

type Phase =
  | { kind: 'idle' }
  | { kind: 'grace'; until: number }
  | { kind: 'countdown'; endsAt: number }
  | { kind: 'staying' };

export function AloneNotice({
  session,
  onLeave,
}: {
  session: CallMedia | null;
  onLeave: () => void;
}) {
  const { t } = useTranslation();
  const snapshot = useCallSnapshot();
  const view = useAtomValue(callEffectiveViewAtom);
  const { getContainer } = useCallContainer();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });
  const [now, setNow] = useState(() => Date.now());
  const hadOthersRef = useRef(false);
  const onLeaveRef = useRef(onLeave);
  onLeaveRef.current = onLeave;

  const room = useRoom(snapshot?.roomId);
  const isDm = !!room?.isDirect;
  const joined = snapshot?.phase === 'joined';
  const others = snapshot?.participants.filter((p) => !p.isLocal && p.connected).length ?? 0;
  const reconnecting = snapshot?.status === 'reconnecting';
  const ring = snapshot?.ring ?? null;
  const unanswered = ring === 'unanswered' || ring === 'declined';

  useEffect(() => {
    hadOthersRef.current = false;
    setPhase({ kind: 'idle' });
  }, [session]);

  useEffect(() => {
    if (!isDm || !joined) {
      setPhase({ kind: 'idle' });
      return;
    }
    if (reconnecting) return;
    if (others > 0) {
      hadOthersRef.current = true;
      setPhase({ kind: 'idle' });
      return;
    }
    if (ring === 'ringing') {
      setPhase({ kind: 'idle' });
      return;
    }
    setPhase((prev) => {
      if (prev.kind !== 'idle') return prev;
      if (unanswered || hadOthersRef.current) {
        return { kind: 'grace', until: Date.now() + ALONE_GRACE_MS };
      }
      return prev;
    });
  }, [isDm, joined, others, ring, unanswered, reconnecting]);

  useEffect(() => {
    if (phase.kind !== 'grace' && phase.kind !== 'countdown') return;
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (phase.kind === 'grace' && current >= phase.until) {
        setPhase({ kind: 'countdown', endsAt: current + ALONE_COUNTDOWN_S * 1000 });
      } else if (phase.kind === 'countdown' && current >= phase.endsAt) {
        setPhase({ kind: 'idle' });
        onLeaveRef.current();
      }
    }, 250);
    return () => clearInterval(timer);
  }, [phase]);

  if (phase.kind !== 'countdown') return null;
  const seconds = Math.min(ALONE_COUNTDOWN_S, Math.max(0, Math.ceil((phase.endsAt - now) / 1000)));

  const container = view === 'docked' || view === 'fullscreen' ? getContainer() : null;
  const card = (
    <div className={container ? css.card : css.floatingCard} role="alertdialog" aria-live="polite">
      <div className={css.copy}>
        <span className={css.title}>{t('call.aloneTitle')}</span>
        <span className={css.subtitle}>{t('call.aloneLeaving', { seconds })}</span>
      </div>
      <div className={css.actions}>
        <Button variant="primary" onClick={() => setPhase({ kind: 'staying' })}>
          {t('call.stay')}
        </Button>
        {unanswered && session && (
          <Button variant="secondary" onClick={() => void session.ringAgain()}>
            {t('call.ringAgain')}
          </Button>
        )}
        <Button variant="secondary" onClick={onLeave}>
          {t('call.leaveNow')}
        </Button>
      </div>
    </div>
  );
  return createPortal(
    container ? <div className={css.backdrop}>{card}</div> : card,
    container ?? document.body
  );
}
