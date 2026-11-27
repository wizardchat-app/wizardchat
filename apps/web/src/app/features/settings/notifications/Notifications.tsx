import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, XIcon, InfoIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import type { NotificationGroup, NotificationLevel, NotificationRules } from '@wizardchat/core';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { ToggleRow } from '@/app/components/Toggle';
import { Tooltip } from '@/app/components/Tooltip';
import { notificationSoundsAtom, notificationBannersAtom } from '@/app/store/atoms';
import { requestNotificationPermission } from '@/app/hooks/useNotifications';
import { getErrorMessage } from '@/util/error';
import { Select } from '@/app/components/Select';
import * as layoutCss from '../Settings.css';
import * as css from './Notifications.css';
const LEVELS: NotificationLevel[] = ['off', 'on', 'noisy'];

export function Notifications() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const [notificationSounds, setNotificationSounds] = useAtom(notificationSoundsAtom);
  const [notificationBanners, setNotificationBanners] = useAtom(notificationBannersAtom);
  const [rules, setRules] = useState<NotificationRules | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setRules(await client.notificationRules());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [client]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (action: () => Promise<void>) => {
      if (!client) return;
      setBusy(true);
      setError(null);
      try {
        await action();
        await load();
      } catch (err) {
        setError(getErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [client, load]
  );

  if (!client) return null;

  const ready = !busy && !!rules;
  const keywords = rules?.keywords ?? [];

  const handleLevel = (group: NotificationGroup, level: NotificationLevel) => {
    void run(() => client.setNotificationLevel(group, level));
  };

  const handleAddKeyword = () => {
    if (!ready) return;
    const keyword = keywordInput.trim();
    if (!keyword) return;
    if (keywords.includes(keyword)) {
      setError(t('settings.notifications.keywordExists'));
      return;
    }
    setKeywordInput('');
    void run(() => client.addNotificationKeyword(keyword));
  };

  const handleRemoveKeyword = (keyword: string) => {
    void run(() => client.removeNotificationKeyword(keyword));
  };

  const renderLevelRow = (label: string, group: NotificationGroup, level: NotificationLevel) => {
    return (
      <div className={layoutCss.settingRow}>
        <div className={layoutCss.settingInfo}>
          <span className={layoutCss.settingLabel}>{label}</span>
        </div>
        <Select
          aria-label={label}
          value={level}
          disabled={!ready}
          options={LEVELS.map((lv) => ({
            value: lv,
            label: t(`settings.notifications.level.${lv}`),
          }))}
          onChange={(v) => handleLevel(group, v as NotificationLevel)}
        />
      </div>
    );
  };

  return (
    <div>
      <h2 className={layoutCss.panelTitle}>{t('settings.notifications.title')}</h2>

      <div className={layoutCss.section}>
        <h3 className={layoutCss.sectionTitle}>{t('settings.notifications.deviceLabel')}</h3>
        <ToggleRow
          label={t('settings.notifications.notificationSounds')}
          description={t('settings.notifications.notificationSoundsNote')}
          checked={notificationSounds}
          onChange={setNotificationSounds}
        />
        <ToggleRow
          label={t('settings.notifications.notificationBanners')}
          description={t('settings.notifications.notificationBannersNote')}
          checked={notificationBanners}
          disabled={!window.desktopAPI?.showNotification && !('Notification' in window)}
          onChange={async (v) => {
            if (!v) {
              setNotificationBanners(false);
              return;
            }
            const result = await requestNotificationPermission();
            setNotificationBanners(result === 'granted');
          }}
        />
      </div>

      <div className={layoutCss.divider} />

      <div className={layoutCss.section}>
        <h3 className={layoutCss.sectionTitle}>
          {t('settings.notifications.messagesLabel')}
          <Tooltip content={t('settings.notifications.levelHint')} multiline placement="right">
            <span className={css.levelHint} aria-label={t('settings.notifications.levelHint')}>
              <InfoIcon size={14} />
            </span>
          </Tooltip>
        </h3>
        {renderLevelRow(t('settings.notifications.dms'), 'directChats', rules?.directChats ?? 'on')}
        {renderLevelRow(t('settings.notifications.rooms'), 'groupChats', rules?.groupChats ?? 'on')}
      </div>

      <div className={layoutCss.divider} />

      <div className={layoutCss.section}>
        <h3 className={layoutCss.sectionTitle}>
          {t('settings.notifications.otherEventsLabel')}
          <Tooltip content={t('settings.notifications.levelHint')} multiline placement="right">
            <span className={css.levelHint} aria-label={t('settings.notifications.levelHint')}>
              <InfoIcon size={14} />
            </span>
          </Tooltip>
        </h3>
        {!rules || rules.userMentions ? (
          renderLevelRow(
            t('settings.notifications.userMention'),
            'userMentions',
            rules?.userMentions ?? 'on'
          )
        ) : (
          <p className={layoutCss.settingNote}>{t('settings.notifications.ruleUnavailable')}</p>
        )}
        {!rules || rules.roomMentions ? (
          renderLevelRow(
            t('settings.notifications.roomMention'),
            'roomMentions',
            rules?.roomMentions ?? 'on'
          )
        ) : (
          <p className={layoutCss.settingNote}>{t('settings.notifications.ruleUnavailable')}</p>
        )}
      </div>

      <div className={layoutCss.divider} />

      <div className={layoutCss.section}>
        <h3 className={layoutCss.sectionTitle}>{t('settings.notifications.keywordsLabel')}</h3>
        <p className={layoutCss.settingNote}>{t('settings.notifications.keywordsNote')}</p>
        <div className={css.keywordRow}>
          <input
            className={`${layoutCss.inputCss} ${css.keywordInput}`}
            value={keywordInput}
            placeholder={t('settings.notifications.keywordPlaceholder')}
            onChange={(e) => setKeywordInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleAddKeyword();
            }}
            disabled={!ready}
          />
          <button
            type="button"
            className={css.keywordButton}
            disabled={!ready}
            onClick={handleAddKeyword}
          >
            <PlusIcon size={14} />
            {t('common.add')}
          </button>
        </div>

        {keywords.length === 0 ? (
          <p className={`${layoutCss.settingNote} ${css.keywordEmpty}`}>
            {t('settings.notifications.noKeywords')}
          </p>
        ) : (
          <ul className={css.keywordList}>
            {keywords.map((keyword) => (
              <li key={keyword} className={css.keywordItem}>
                <span className={css.keywordText}>{keyword}</span>
                <button
                  type="button"
                  className={css.keywordDel}
                  disabled={busy}
                  onClick={() => handleRemoveKeyword(keyword)}
                  aria-label={t('common.remove')}
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {error && <p className={css.errorText}>{error}</p>}
    </div>
  );
}
