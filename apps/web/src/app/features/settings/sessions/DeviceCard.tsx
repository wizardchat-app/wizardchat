import { useAtomValue } from 'jotai';
import { streamerModeActiveAtom } from '@/app/store/atoms';
import { HIDDEN_TEXT, RevealButton } from '@/app/components/Secret';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  SpinnerGapIcon,
  DevicesIcon,
  TrashIcon,
  PencilSimpleIcon,
  DotsThreeVerticalIcon,
  CaretDownIcon,
  CaretUpIcon,
} from '@phosphor-icons/react';
import { Tooltip } from '@/app/components/Tooltip';
import { Button } from '@/app/components/Button';
import { formatDateLabel, formatTime } from '@/util/format';
import { useContextMenu } from '@/app/hooks/useContextMenu';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import * as css from './Sessions.css';

export interface DeviceEntry {
  deviceId: string;
  displayName: string;
  isCurrentDevice: boolean;
  isVerified: boolean | null;
  lastSeenIp: string | null;
  lastSeenTs: number | null;
}

interface DeviceCardProps {
  device: DeviceEntry;
  actionLoading: string | null;
  onVerify: (deviceId: string) => void;
  onRemove: (deviceId: string, displayName: string) => void;
  onRename: (deviceId: string, newName: string) => void;
  belowRow?: ReactNode;
  extraMenuItems?: ContextMenuItem[];
}

export function DeviceCard({
  device: d,
  actionLoading,
  onVerify,
  onRemove,
  onRename,
  belowRow,
  extraMenuItems,
}: DeviceCardProps) {
  const { t, i18n } = useTranslation();
  const { openContextMenu } = useContextMenu();
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(d.displayName);
  const streamer = useAtomValue(streamerModeActiveAtom);
  const [revealed, setRevealed] = useState(false);
  const hide = streamer && !revealed;
  const nameInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) return;
    nameInputRef.current?.focus();
    nameInputRef.current?.select();
  }, [editing]);

  const menuItems: ContextMenuItem[] = [
    {
      label: t('common.rename'),
      icon: <PencilSimpleIcon size={16} />,
      onClick: () => {
        setDraft(d.displayName);
        setEditing(true);
      },
    },
  ];
  if (!d.isCurrentDevice) {
    menuItems.push({
      label: t('common.remove'),
      icon: <TrashIcon size={16} />,
      danger: true,
      onClick: () => onRemove(d.deviceId, d.displayName),
    });
  }
  if (extraMenuItems) menuItems.push(...extraMenuItems);

  const handleMenu = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (menuItems.length > 0) openContextMenu(e, menuItems);
  };

  const cleanDraft = draft.trim();
  const canSave = cleanDraft.length > 0 && cleanDraft !== d.displayName;

  const commitRename = () => {
    if (!canSave || actionLoading !== null) return;
    setEditing(false);
    setDraft(cleanDraft);
    onRename(d.deviceId, cleanDraft);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraft(d.displayName);
  };

  const lastActivity = d.lastSeenTs
    ? `${formatDateLabel(d.lastSeenTs, t, i18n.language)} ${formatTime(d.lastSeenTs, i18n.language)}`
    : '-';

  return (
    <div className={d.isCurrentDevice ? css.deviceCardCurrent : css.deviceCard}>
      <div className={css.deviceRow}>
        <div className={css.deviceIconWrap}>
          <div className={css.deviceIcon}>
            <DevicesIcon size={18} />
          </div>
          {d.isVerified === false ? (
            <Tooltip content={t('settings.sessions.unverified')}>
              <span
                className={css.deviceDotUnverified}
                role="img"
                aria-label={t('settings.sessions.unverified')}
              />
            </Tooltip>
          ) : d.isVerified === true ? (
            <Tooltip content={t('common.verified')}>
              <span
                className={css.deviceDotVerified}
                role="img"
                aria-label={t('common.verified')}
              />
            </Tooltip>
          ) : null}
        </div>

        <div className={css.deviceInfo}>
          {editing ? (
            <div className={css.editForm}>
              <input
                type="text"
                className={css.nameInput}
                value={draft}
                maxLength={64}
                ref={nameInputRef}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') commitRename();
                  if (e.key === 'Escape') cancelEdit();
                }}
                disabled={actionLoading !== null}
                aria-label={t('common.rename')}
              />
              <div className={css.editActions}>
                <Button
                  size="sm"
                  variant="primary"
                  loading={actionLoading === d.deviceId}
                  spinnerWhileLoading
                  disabled={actionLoading !== null || !canSave}
                  onClick={commitRename}
                >
                  {t('common.save')}
                </Button>
                <button
                  type="button"
                  className={css.editCancelBtn}
                  disabled={actionLoading !== null}
                  onClick={cancelEdit}
                >
                  {t('common.cancel')}
                </button>
              </div>
              <p className={css.renameHint}>{t('settings.sessions.renameSessionHint')}</p>
            </div>
          ) : (
            <div className={css.deviceName}>
              <span>{hide ? HIDDEN_TEXT : d.displayName}</span>
              {streamer && (
                <RevealButton
                  shown={revealed}
                  onToggle={() => setRevealed(!revealed)}
                  label={t('streamerMode.hidden')}
                />
              )}
              <Tooltip
                content={
                  detailsOpen
                    ? t('settings.sessions.hideDetails')
                    : t('settings.sessions.showDetails')
                }
              >
                <button
                  type="button"
                  className={css.expandBtn}
                  aria-expanded={detailsOpen}
                  aria-label={
                    detailsOpen
                      ? t('settings.sessions.hideDetails')
                      : t('settings.sessions.showDetails')
                  }
                  onClick={() => setDetailsOpen((v) => !v)}
                >
                  {detailsOpen ? <CaretUpIcon size={14} /> : <CaretDownIcon size={14} />}
                </button>
              </Tooltip>
            </div>
          )}
        </div>

        {!d.isCurrentDevice && d.isVerified === false && (
          <button
            type="button"
            className={css.verifyBtn}
            disabled={actionLoading !== null}
            onClick={() => onVerify(d.deviceId)}
          >
            {actionLoading === d.deviceId ? (
              <SpinnerGapIcon size={14} className="icon-spin" />
            ) : (
              t('settings.sessions.verify')
            )}
          </button>
        )}

        <Tooltip content={t('common.menu')}>
          <button
            type="button"
            className={css.deviceMenuBtn}
            aria-label={t('common.menu')}
            disabled={actionLoading !== null}
            onClick={handleMenu}
          >
            <DotsThreeVerticalIcon size={16} weight="bold" />
          </button>
        </Tooltip>
      </div>

      {detailsOpen && (
        <div className={css.deviceDetails}>
          <div className={css.detailRow}>
            <span className={css.detailLabel}>{t('settings.sessions.lastActivity')}</span>
            <span className={css.detailValue}>{lastActivity}</span>
          </div>
          <div className={css.detailRow}>
            <span className={css.detailLabel}>{t('settings.sessions.deviceId')}</span>
            <span className={`${css.detailValue} ${css.detailValueMono}`}>
              {hide ? HIDDEN_TEXT : d.deviceId}
            </span>
          </div>
          <div className={css.detailRow}>
            <span className={css.detailLabel}>{t('settings.sessions.ipAddress')}</span>
            <span className={css.detailValue}>
              {hide && d.lastSeenIp ? HIDDEN_TEXT : (d.lastSeenIp ?? '-')}
            </span>
          </div>
        </div>
      )}

      {belowRow}
    </div>
  );
}
