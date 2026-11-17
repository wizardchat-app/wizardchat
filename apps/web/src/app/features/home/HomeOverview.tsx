import { useLayoutEffect, useRef, useState } from 'react';
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
  const { heroRef, titleRef, actionsRef, compact } = useCompactActions(name);
  const inboxLabel = t('inbox.title');
  const whatsNewLabel = t('whatsNew.title');

  return (
    <div className={css.page}>
      <div className={css.content}>
        <section ref={heroRef} className={css.hero}>
          <LogoHover size={64} />
          <div className={css.heroText}>
            <h1 ref={titleRef} className={css.heroTitle}>
              {t('home.welcome', { name })}
            </h1>
          </div>
          <div ref={actionsRef} className={css.heroActions}>
            <button
              type="button"
              className={compact ? css.heroIconButton : css.heroButton}
              aria-label={compact ? inboxLabel : undefined}
              title={compact ? inboxLabel : undefined}
              onClick={() => setInboxOpen(true)}
            >
              <TrayIcon size={16} />
              {!compact && inboxLabel}
              {inboxBadge.show && (
                <span className={inboxBadge.mention ? css.dotMention : css.dot} />
              )}
            </button>
            <button
              type="button"
              className={compact ? css.heroIconButton : css.heroButton}
              aria-label={compact ? whatsNewLabel : undefined}
              title={compact ? whatsNewLabel : undefined}
              onClick={() => setWhatsNewOpen(true)}
            >
              <SparkleIcon size={16} />
              {!compact && whatsNewLabel}
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

function useCompactActions(name: string) {
  const heroRef = useRef<HTMLElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  const labelledWidth = useRef(0);
  const compactRef = useRef(false);
  const [compact, setCompact] = useState(false);

  useLayoutEffect(() => {
    const hero = heroRef.current;
    const title = titleRef.current;
    const actions = actionsRef.current;
    const text = title?.parentElement;
    if (!hero || !title || !actions || !text) return;
    const update = () => {
      if (!compactRef.current) labelledWidth.current = actions.offsetWidth;
      const room = text.clientWidth + actions.offsetWidth - labelledWidth.current;
      compactRef.current = title.scrollWidth > room;
      setCompact(compactRef.current);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(hero);
    return () => observer.disconnect();
  }, [name]);

  return { heroRef, titleRef, actionsRef, compact };
}
