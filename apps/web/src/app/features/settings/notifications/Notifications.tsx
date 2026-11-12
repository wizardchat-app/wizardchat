import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PlusIcon, XIcon, InfoIcon } from '@phosphor-icons/react';
import { useAtom } from 'jotai';
import { getMatrixClientOrNull } from '@/client/initMatrix';
import { ToggleRow } from '@/app/components/Toggle';
import { Tooltip } from '@/app/components/Tooltip';
import { notificationSoundsAtom, notificationBannersAtom } from '@/app/store/atoms';
import { requestNotificationPermission } from '@/app/hooks/useNotifications';
import { getErrorMessage } from '@/util/error';
import { Select } from '@/app/components/Select';
import * as layoutCss from '../Settings.css';
import * as css from './Notifications.css';
import {
  type ManagedRule,
  type PushRules,
  type NotifRowLevel,
  DM_RULES,
  ROOM_RULES,
  getUserMentionRules,
  getRoomMentionRules,
  deriveRowLevel,
  setRowLevel,
  listKeywordRules,
  addKeywordRule,
  removeKeywordRule,
  normalizeKeyword,
} from './accountNotifications';

const LEVELS: NotifRowLevel[] = ['off', 'on', 'noisy'];

export function Notifications() {
  const { t } = useTranslation();
  const client = getMatrixClientOrNull();
  const [notificationSounds, setNotificationSounds] = useAtom(notificationSoundsAtom);
  const [notificationBanners, setNotificationBanners] = useAtom(notificationBannersAtom);
  const [rules, setRules] = useState<PushRules | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [keywordInput, setKeywordInput] = useState('');

  const fetchRules = useCallback(async (): Promise<PushRules | undefined> => {
    if (!client) return undefined;
    const raw = (await client.pushRules()) as { global?: PushRules } & PushRules;
    return raw.global ?? raw;
  }, [client]);

  const load = useCallback(async () => {
    if (!client) return;
    try {
      setRules(await fetchRules());
    } catch (err) {
      setError(getErrorMessage(err));
    }
  }, [client, fetchRules]);

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
  const userMentionRules = getUserMentionRules(rules);
  const roomMentionRules = getRoomMentionRules(rules);
  const keywords = listKeywordRules(rules);

  const handleLevel = (managed: ManagedRule[], level: NotifRowLevel) => {
    if (!rules) return;
    void run(() => setRowLevel(client, rules, managed, level));
  };

  const handleAddKeyword = () => {
    if (!ready) return;
    const keyword = normalizeKeyword(keywordInput);
    if (!keyword) return;
    if (keywords.some((r) => r.rule_id === keyword)) {
      setError(t('settings.notifications.keywordExists'));
      return;
    }
    setKeywordInput('');
    void run(() => addKeywordRule(client, keyword));
  };

  const handleRemoveKeyword = (keyword: string) => {
    void run(() => removeKeywordRule(client, keyword));
  };

  const renderLevelRow = (label: string, managed: ManagedRule[]) => {
    const level = deriveRowLevel(rules, managed);
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
          onChange={(v) => handleLevel(managed, v as NotifRowLevel)}
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
        {renderLevelRow(t('settings.notifications.dms'), DM_RULES)}
        {renderLevelRow(t('settings.notifications.rooms'), ROOM_RULES)}
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
        {userMentionRules.length > 0 ? (
          renderLevelRow(t('settings.notifications.userMention'), userMentionRules)
        ) : (
          <p className={layoutCss.settingNote}>{t('settings.notifications.ruleUnavailable')}</p>
        )}
        {roomMentionRules.length > 0 ? (
          renderLevelRow(t('settings.notifications.roomMention'), roomMentionRules)
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
            {keywords.map((rule) => (
              <li key={rule.rule_id} className={css.keywordItem}>
                <span className={css.keywordText}>{rule.rule_id}</span>
                <button
                  type="button"
                  className={css.keywordDel}
                  disabled={busy}
                  onClick={() => handleRemoveKeyword(rule.rule_id)}
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
