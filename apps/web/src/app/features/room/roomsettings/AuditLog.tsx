import { useEffect, useMemo, useState } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { useInfiniteQuery } from '@tanstack/react-query';
import type { WizardClient } from '@wizardchat/core';
import { ArrowClockwiseIcon, FunnelSimpleIcon } from '@phosphor-icons/react';
import { Avatar } from '@/app/components/Avatar';
import { Button, IconButton } from '@/app/components/Button';
import { Select } from '@/app/components/Select';
import { Spinner } from '@/app/components/Spinner';
import { useMembers, useRoom } from '@/app/data';
import { getErrorMessage } from '@/util/error';
import { getRoleLabel } from '../memberRoles';
import {
  describeAuditEntry,
  type AuditFilter,
  type AuditItem,
  type AuditLine,
} from './auditLogEntries';
import * as panelCss from '@/app/components/Settings/Settings.css';
import * as css from './AuditLog.css';

const FILTERS: AuditFilter[] = ['all', 'moderation', 'members', 'settings'];
const FILL_COUNT = 30;

const JOIN_RULE_KEYS: Record<string, string> = {
  public: 'room.settings.security.accessPublic',
  invite: 'room.settings.security.accessInvite',
  knock: 'room.settings.security.accessKnock',
  restricted: 'room.settings.security.accessSpaceMembers',
  knock_restricted: 'room.settings.security.accessSpaceMembers',
};

const HISTORY_KEYS: Record<string, string> = {
  world_readable: 'room.settings.security.historyAnyone',
  shared: 'room.settings.security.historyShared',
  invited: 'room.settings.security.historyInvited',
  joined: 'room.settings.security.historyMembersSinceJoin',
};

interface Person {
  name: string;
  avatar: string | null;
}

function RoomRef({ id }: { id: string }) {
  const room = useRoom(id);
  return <span className={css.name}>{room?.name ?? id}</span>;
}

export function AuditLogPanel({
  roomId,
  client,
  isSpace,
}: {
  roomId: string;
  client: WizardClient;
  isSpace: boolean;
}) {
  const { t, i18n } = useTranslation();
  const [filter, setFilter] = useState<AuditFilter>('all');
  const { data: members } = useMembers(roomId);
  const query = useInfiniteQuery({
    queryKey: ['auditLog', roomId],
    queryFn: ({ pageParam }) => client.auditLog(roomId, pageParam),
    initialPageParam: null as string | null,
    getNextPageParam: (page) => page.next ?? undefined,
    staleTime: 60_000,
  });

  const entries = useMemo(() => query.data?.pages.flatMap((p) => p.entries) ?? [], [query.data]);
  const items = useMemo(
    () =>
      entries
        .map((entry) => describeAuditEntry(entry, isSpace))
        .filter((item): item is AuditItem => item !== null),
    [entries, isSpace]
  );
  const shown = filter === 'all' ? items : items.filter((item) => item.category === filter);
  const { hasNextPage, isFetchingNextPage, isError, fetchNextPage } = query;
  useEffect(() => {
    if (shown.length < FILL_COUNT && hasNextPage && !isFetchingNextPage && !isError)
      void fetchNextPage();
  }, [shown.length, hasNextPage, isFetchingNextPage, isError, fetchNextPage]);

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const entry of [...entries].reverse()) {
      const event = entry.event as {
        type?: string;
        state_key?: string;
        content?: { displayname?: unknown; avatar_url?: unknown };
      };
      if (event.type !== 'm.room.member' || !event.state_key) continue;
      const name = event.content?.displayname;
      const avatar = event.content?.avatar_url;
      if (typeof name === 'string' && name)
        map.set(event.state_key, {
          name,
          avatar: typeof avatar === 'string' ? avatar : null,
        });
    }
    for (const member of members ?? []) {
      if (member.displayName)
        map.set(member.userId, { name: member.displayName, avatar: member.avatarUrl });
    }
    return map;
  }, [entries, members]);
  const person = (userId: string): Person => people.get(userId) ?? { name: userId, avatar: null };

  const filterOptions = FILTERS.map((value) => ({
    value,
    label: t(`room.settings.audit.filters.${value}`),
  }));

  const value = (line: AuditLine): string => {
    if (!line.value) return '';
    if (line.key === 'joinRuleChanged')
      return t(JOIN_RULE_KEYS[line.value] ?? 'room.settings.security.accessInvite');
    if (line.key === 'historyChanged')
      return t(HISTORY_KEYS[line.value] ?? 'room.settings.security.historyShared');
    return line.value;
  };

  const renderLine = (item: AuditItem, line: AuditLine, index: number) => {
    const resolved = value(line);
    const [from, to] =
      line.key === 'roleChanged' && line.value
        ? line.value.split(':').map((level) => getRoleLabel(level, t))
        : [];
    return (
      <div key={index} className={css.line}>
        <Trans
          i18nKey={`room.settings.audit.actions.${line.key}`}
          values={{
            actor: person(item.actorId).name,
            target: line.targetId ? person(line.targetId).name : '',
            value: resolved,
            from,
            to,
          }}
          components={{
            actor: <span className={css.name} />,
            target: <span className={css.name} />,
            b: <span className={css.name} />,
            room: <RoomRef id={line.value ?? ''} />,
          }}
        />
      </div>
    );
  };

  const formatTs = (ts: number) =>
    new Date(ts).toLocaleString(i18n.language, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div>
      <h2 className={panelCss.panelTitle}>{t('room.settings.audit.title')}</h2>
      <div className={panelCss.section}>
        <div className={css.toolbar}>
          <Select
            icon={<FunnelSimpleIcon size={14} />}
            value={filter}
            options={filterOptions}
            aria-label={t('room.settings.audit.filterLabel')}
            onChange={setFilter}
          />
          <IconButton
            size="lg"
            bordered
            tooltip={t('common.refresh')}
            aria-label={t('common.refresh')}
            disabled={query.isFetching}
            onClick={() => void query.refetch()}
          >
            <ArrowClockwiseIcon size={16} />
          </IconButton>
        </div>
        {query.isPending || (shown.length === 0 && query.isFetchingNextPage) ? (
          <div className={css.more}>
            <Spinner size="md" />
          </div>
        ) : query.isError ? (
          <div className={panelCss.noResults}>
            {t('room.settings.audit.loadFailed', { error: getErrorMessage(query.error) })}
          </div>
        ) : shown.length === 0 && !query.hasNextPage ? (
          <div className={panelCss.noResults}>{t('room.settings.audit.empty')}</div>
        ) : (
          <div className={css.list}>
            {shown.map((item) => {
              const actor = person(item.actorId);
              return (
                <div key={item.id} className={css.row}>
                  <Avatar
                    name={actor.name}
                    mxcUrl={actor.avatar}
                    client={client}
                    size="sm"
                    placeholder="logo"
                  />
                  <div className={css.body}>
                    {item.lines.map((line, index) => renderLine(item, line, index))}
                    {item.reason && (
                      <div className={css.quote}>
                        {t('room.settings.audit.reason', { reason: item.reason })}
                      </div>
                    )}
                    {item.detail && <div className={css.quote}>{item.detail}</div>}
                  </div>
                  <span className={css.time}>{formatTs(item.ts)}</span>
                </div>
              );
            })}
          </div>
        )}
        {query.hasNextPage && (
          <div className={css.more}>
            <Button
              variant="secondary"
              size="sm"
              loading={query.isFetchingNextPage}
              onClick={() => void query.fetchNextPage()}
            >
              {t('room.settings.audit.loadOlder')}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
