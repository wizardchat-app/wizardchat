import { useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import type { WizardClient } from '@wizardchat/core';
import {
  ChatCircleIcon,
  CompassIcon,
  DevicesIcon,
  ArrowRightIcon,
  SparkleIcon,
  StackIcon,
  TrayIcon,
} from '@phosphor-icons/react';
import { LogoHover } from '@/app/components/AppLoading';
import {
  createSpaceOpenAtom,
  exploreOpenAtom,
  getAppsOpenAtom,
  inboxOpenAtom,
  newDmOpenAtom,
  whatsNewOpenAtom,
} from '@/app/store/atoms';
import { useProfile } from '@/app/data';
import { useInboxBadge } from '@/app/features/inbox';
import { formatUserId } from '@/util/matrix';
import * as css from './HomeOverview.css';

export function HomeOverview({ client }: { client: WizardClient }) {
  const { t } = useTranslation();
  const myId = client.userId() ?? '';
  const { data: profile } = useProfile(myId);
  const inboxBadge = useInboxBadge();
  const setInboxOpen = useSetAtom(inboxOpenAtom);
  const setWhatsNewOpen = useSetAtom(whatsNewOpenAtom);
  const setNewDmOpen = useSetAtom(newDmOpenAtom);
  const setCreateSpaceOpen = useSetAtom(createSpaceOpenAtom);
  const setExploreOpen = useSetAtom(exploreOpenAtom);
  const setGetAppsOpen = useSetAtom(getAppsOpenAtom);

  const name = profile?.displayName || formatUserId(myId);

  return (
    <div className={css.page}>
      <div className={css.content}>
        <section className={css.hero}>
          <LogoHover size={64} />
          <div className={css.heroText}>
            <h1 className={css.heroTitle}>{t('home.welcome', { name })}</h1>
          </div>
          <div className={css.heroActions}>
            <button type="button" className={css.heroButton} onClick={() => setInboxOpen(true)}>
              <TrayIcon size={16} />
              {t('inbox.title')}
              {inboxBadge.show && (
                <span className={inboxBadge.mention ? css.dotMention : css.dot} />
              )}
            </button>
            <button type="button" className={css.heroButton} onClick={() => setWhatsNewOpen(true)}>
              <SparkleIcon size={16} />
              {t('whatsNew.title')}
            </button>
          </div>
        </section>

        <section className={css.section}>
          <h2 className={css.sectionTitle}>{t('home.whatNext')}</h2>
          <div className={css.actions}>
            <button type="button" className={css.action} onClick={() => setNewDmOpen(true)}>
              <ChatCircleIcon size={24} className={css.actionIcon} />
              {t('timeline.startDm')}
            </button>
            <button
              type="button"
              className={css.action}
              onClick={() => setCreateSpaceOpen({ open: true })}
            >
              <StackIcon size={24} className={css.actionIcon} />
              {t('space.chooseCreateJoin')}
            </button>
            <button type="button" className={css.action} onClick={() => setExploreOpen(true)}>
              <CompassIcon size={24} className={css.actionIcon} />
              {t('home.exploreCommunities')}
            </button>
          </div>
        </section>

        <section className={css.appsCard}>
          <span className={css.appsIcon}>
            <DevicesIcon size={24} />
          </span>
          <div className={css.appsText}>
            <span className={css.appsTitle}>{t('getApps.title')}</span>
            <span className={css.appsSub}>{t('getApps.subtitle')}</span>
          </div>
          <button type="button" className={css.heroButton} onClick={() => setGetAppsOpen(true)}>
            {t('home.viewApps')}
            <ArrowRightIcon size={16} />
          </button>
        </section>
      </div>
    </div>
  );
}
