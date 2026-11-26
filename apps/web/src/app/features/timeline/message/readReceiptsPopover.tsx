import { useCallback, useEffect, useRef, useState } from 'react';
import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useTimeFormat } from '@/app/hooks/useTimeFormat';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { userProfileAtom } from '@/app/store/atoms';
import { formatShortDateLabel } from '@/util/format';
import { formatUserId } from '@/util/matrix';
import { Avatar } from '@/app/components/Avatar';
import { Popover } from '@/app/components/Popover';
import type { ReceiptUser } from '@/app/hooks/useRoomReceipts';
import * as css from '../Timeline.css';

export function useReadReceiptsPopover() {
  const anchorRef = useRef<HTMLElement | null>(null);
  const [open, setOpen] = useState(false);

  const openFor = useCallback((el: HTMLElement) => {
    anchorRef.current = el.parentElement ?? el;
    setOpen(true);
  }, []);

  const close = useCallback(() => setOpen(false), []);

  return { anchorRef, open, openFor, close };
}

interface ReadReceiptsPopoverProps {
  client: MatrixClient;
  roomId: string | null | undefined;
  users: ReceiptUser[];
  anchorRef: React.RefObject<HTMLElement | null>;
  open: boolean;
  onClose: () => void;
  title?: string;
  showTimestamp?: boolean;
}

export function ReadReceiptsPopover({
  client,
  roomId,
  users,
  anchorRef,
  open,
  onClose,
  title,
  showTimestamp = true,
}: ReadReceiptsPopoverProps) {
  const { t, i18n } = useTranslation();
  const timeFormat = useTimeFormat();
  const setProfile = useSetAtom(userProfileAtom);

  useEffect(() => {
    if (open && users.length === 0) onClose();
  }, [open, users.length, onClose]);

  const handleSelect = useCallback(
    (user: ReceiptUser) => (e: React.MouseEvent<HTMLButtonElement>) => {
      e.stopPropagation();
      const rect = e.currentTarget.getBoundingClientRect();
      setProfile({
        userId: user.userId,
        roomId,
        anchorRect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height },
      });
      onClose();
    },
    [roomId, setProfile, onClose]
  );

  return (
    <Popover open={open} onClose={onClose} anchorRef={anchorRef} role="list" maxHeight={260}>
      <div className={css.receiptPopoverTitle}>
        {title ?? t('timeline.readReceipts', { count: users.length })}
      </div>
      {users.map((user) => (
        <li key={user.userId} className={css.receiptPopoverItem}>
          <button type="button" className={css.receiptPopoverRow} onClick={handleSelect(user)}>
            <Avatar
              name={user.displayName}
              mxcUrl={user.avatarUrl}
              client={client}
              size="sm"
              placeholder="logo"
            />
            <span className={css.receiptPopoverMeta}>
              <span className={css.receiptPopoverUserName}>{formatUserId(user.userId)}</span>
              {showTimestamp && (
                <span className={css.receiptPopoverTime}>
                  {formatShortDateLabel(user.ts, t, i18n.language)} · {timeFormat.time(user.ts)}
                </span>
              )}
            </span>
          </button>
        </li>
      ))}
    </Popover>
  );
}
