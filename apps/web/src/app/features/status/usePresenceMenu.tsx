import { useCallback } from 'react';
import { useAtom, useAtomValue } from 'jotai';
import { useTranslation } from 'react-i18next';
import { WarningCircleIcon } from '@phosphor-icons/react';
import { presenceOverrideAtom, presenceSupportAtom, userIdAtom } from '@/app/store/atoms';
import type { PresenceOverride } from '@/app/store/atoms';
import type { ContextMenuItem } from '@/app/features/contextMenu/contextMenuAtom';
import { useConfirm } from '@/app/hooks/useConfirm';

const PRESENCE_DOT_COLOR: Record<Exclude<PresenceOverride, 'auto'>, string> = {
  online: '#4ade80',
  unavailable: '#facc15',
  offline: '#6b7280',
};

export function PresenceDot({ state, size = 10 }: { state: PresenceOverride; size?: number }) {
  return (
    <span
      aria-hidden
      style={{
        display: 'inline-block',
        flexShrink: 0,
        width: size,
        height: size,
        borderRadius: '50%',
        boxSizing: 'border-box',
        ...(state === 'auto'
          ? { border: '2px solid currentColor' }
          : { backgroundColor: PRESENCE_DOT_COLOR[state] }),
      }}
    />
  );
}

export function usePresenceLabels(): Record<PresenceOverride, string> {
  const { t } = useTranslation();
  return {
    auto: t('presence.auto'),
    online: t('presence.online'),
    unavailable: t('presence.away'),
    offline: t('presence.offline'),
  };
}

const PRESENCE_OPTIONS: PresenceOverride[] = ['auto', 'online', 'unavailable', 'offline'];

export function usePresenceMenu() {
  const { t } = useTranslation();
  const userId = useAtomValue(userIdAtom);
  const [presenceOverride, setPresenceOverride] = useAtom(presenceOverrideAtom);
  const presenceUnsupported = useAtomValue(presenceSupportAtom) === 'unsupported';
  const confirmDialog = useConfirm();
  const labels = usePresenceLabels();

  return useCallback((): ContextMenuItem[] => {
    const serverName = userId?.split(':').slice(1).join(':') ?? '';
    return [
      ...(presenceUnsupported
        ? [
            {
              label: t('presence.unsupported'),
              icon: <WarningCircleIcon size={16} />,
              danger: true,
              chevron: true,
              onClick: () =>
                void confirmDialog({
                  title: t('presence.unsupportedTitle'),
                  message: t('presence.unsupportedMessage', { server: serverName }),
                  alert: true,
                }),
            },
            { label: '', divider: true, onClick: () => {} },
          ]
        : []),
      ...PRESENCE_OPTIONS.map((state) => ({
        label: labels[state],
        icon: <PresenceDot state={state} />,
        checked: presenceOverride === state,
        onClick: () => setPresenceOverride(state),
      })),
    ];
  }, [
    t,
    userId,
    presenceUnsupported,
    confirmDialog,
    labels,
    presenceOverride,
    setPresenceOverride,
  ]);
}
