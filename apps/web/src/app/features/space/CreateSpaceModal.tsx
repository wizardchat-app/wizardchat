import { useEffect, useState } from 'react';
import { useAtom, useSetAtom } from 'jotai';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { StackIcon, StackPlusIcon, LinkIcon, CompassIcon } from '@phosphor-icons/react';
import { createRoomOpenAtom, createSpaceOpenAtom, currentRoomIdAtom } from '@/app/store/atoms';
import { useSwitchContext } from '@/app/pages/client/hooks/useContextNavigation';
import { getMatrixClient, getMatrixClientOrNull } from '@/client/initMatrix';
import { useToast } from '@/app/hooks/useToast';
import { getErrorMessage } from '@/util/error';
import { viaServersFor, normalizeJoinTarget } from '@/util/matrix';
import { exploreOpenAtom } from '@/app/store/atoms';
import { Modal } from '@/app/components/Modal';
import { Button } from '@/app/components/Button';
import { Input } from '@/app/components/Input';
import { ToggleRow } from '@/app/components/Toggle';
import {
  FoundersField,
  useFoundersRoomVersion,
  type Founder,
} from '@/app/features/room/FoundersField';
import * as css from './CreateSpaceModal.css';

type View = 'choose' | 'create' | 'join';

const SPACE_POWER_LEVELS = {
  invite: 100,
  kick: 100,
  ban: 100,
  redact: 50,
  state_default: 50,
  events_default: 50,
  users_default: 0,
  events: {
    'm.room.power_levels': 100,
    'm.room.history_visibility': 100,
    'm.room.tombstone': 100,
    'm.room.encryption': 100,
    'm.room.name': 50,
    'm.room.message': 50,
    'm.room.encrypted': 50,
    'm.sticker': 50,
  },
};

export function CreateSpaceModal() {
  const { t } = useTranslation();
  const [state, setState] = useAtom(createSpaceOpenAtom);
  const setExploreOpen = useSetAtom(exploreOpenAtom);
  const setCurrentRoomId = useSetAtom(currentRoomIdAtom);
  const setCreateRoomOpen = useSetAtom(createRoomOpenAtom);
  const switchContext = useSwitchContext();
  const navigate = useNavigate();
  const toast = useToast();

  const { open, parentSpaceId, parentSpaceName, view: initialView } = state;

  const [view, setView] = useState<View>('choose');
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(false);
  const [federated, setFederated] = useState(true);
  const [spaceAlias, setSpaceAlias] = useState('');
  const [founders, setFounders] = useState<Founder[]>([]);
  const [starterRooms, setStarterRooms] = useState(true);
  const [createLoading, setCreateLoading] = useState(false);
  const [spaceId, setSpaceId] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);

  // When creating a subspace, skip the create/join chooser and go straight to the create form.
  useEffect(() => {
    if (open && parentSpaceId) setView('create');
    else if (open && initialView === 'join') setView('join');
  }, [open, parentSpaceId, initialView]);

  const resetAndClose = () => {
    setState({ open: false });
    setView('choose');
    setName('');
    setDescription('');
    setIsPublic(false);
    setFederated(true);
    setSpaceAlias('');
    setSpaceId('');
    setFounders([]);
    setStarterRooms(true);
  };

  const foundersRoomVersion = useFoundersRoomVersion(open);
  const mx = getMatrixClientOrNull();
  const canCreate = name.trim().length > 0;
  const canJoin = normalizeJoinTarget(spaceId) !== null;

  const handleCreate = async () => {
    if (!canCreate) return;
    const trimmedName = name.trim();

    setCreateLoading(true);
    try {
      const client = getMatrixClient();
      const founderIds = foundersRoomVersion ? founders.map((f) => f.userId) : [];
      const newRoomId = await client.createRoom({
        name: trimmedName,
        topic: description.trim() || undefined,
        isPublic,
        isSpace: true,
        parentSpaceId: parentSpaceId ?? null,
        federate: federated,
        powerLevels: SPACE_POWER_LEVELS,
        ...(founderIds.length > 0 && foundersRoomVersion
          ? { founders: founderIds, roomVersion: foundersRoomVersion, invite: founderIds }
          : {}),
      });

      const aliasToSet = spaceAlias.trim();
      if (isPublic && aliasToSet && newRoomId) {
        try {
          await client.addRoomAlias(newRoomId, aliasToSet);
          await client.setCanonicalAlias(newRoomId, aliasToSet, []);
        } catch (aliasErr) {
          toast.error(t('space.create.aliasCreateFailed', { error: getErrorMessage(aliasErr) }));
        }
      }

      if (starterRooms && newRoomId) {
        for (const [key, isVoice] of [
          ['space.create.starterChat', false],
          ['space.create.starterVoice', true],
        ] as const) {
          try {
            await client.createRoom({
              name: t(key),
              isVoice,
              parentSpaceId: newRoomId,
              federate: federated,
              access: 'restricted',
            });
          } catch (roomErr) {
            toast.error(t('room.create.failed', { error: getErrorMessage(roomErr) }));
          }
        }
      }

      resetAndClose();
    } catch (err) {
      toast.error(t('space.create.failed', { error: getErrorMessage(err) }));
    } finally {
      setCreateLoading(false);
    }
  };

  const handleJoin = async () => {
    const target = normalizeJoinTarget(spaceId);
    if (!target) return;

    setJoinLoading(true);
    try {
      const client = getMatrixClient();
      const domain = client.userId()?.split(':').slice(1).join(':') ?? null;
      const derived = viaServersFor(target.roomIdOrAlias, domain).viaServers;
      const viaServers = target.viaServers.length > 0 ? target.viaServers : derived;
      const roomId = await client.join(
        target.roomIdOrAlias,
        viaServers.length > 0 ? viaServers : null
      );
      const details = await client.roomDetails(roomId).catch(() => null);
      resetAndClose();
      const id = encodeURIComponent(roomId);
      if (details?.isSpace) {
        navigate(`/space/${id}`);
      } else {
        setCurrentRoomId(roomId);
        navigate(details?.isDirect ? `/dm/${id}` : `/r/${id}`);
      }
    } catch (err) {
      toast.error(t('common.joinFailed', { error: getErrorMessage(err) }));
    } finally {
      setJoinLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (view === 'create') handleCreate();
      else if (view === 'join') handleJoin();
    }
  };

  const title = parentSpaceName
    ? t('space.create.titleInParent', { name: parentSpaceName })
    : view === 'choose'
      ? t('space.chooseCreateJoin')
      : view === 'create'
        ? t('space.create.title')
        : t('space.join.title');

  return (
    <Modal
      open={open}
      onClose={resetAndClose}
      size="md"
      title={title}
      titleIcon={<StackIcon size={18} weight="fill" />}
      footer={
        view === 'create' ? (
          <>
            {!parentSpaceId && (
              <Button variant="secondary" onClick={() => setView('choose')}>
                {t('common.back')}
              </Button>
            )}
            <Button
              variant="primary"
              loading={createLoading}
              onClick={handleCreate}
              disabled={!canCreate}
            >
              {t('common.create')}
            </Button>
          </>
        ) : view === 'join' ? (
          <>
            <Button variant="secondary" onClick={() => setView('choose')}>
              {t('common.back')}
            </Button>
            <Button
              variant="primary"
              loading={joinLoading}
              onClick={handleJoin}
              disabled={!canJoin}
            >
              {t('space.join.titleShort')}
            </Button>
          </>
        ) : null
      }
    >
      {view === 'choose' && (
        <div className={css.panel} style={{ gap: 10 }}>
          <Button
            variant="secondary"
            onClick={() => setView('create')}
            size="sm"
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <StackPlusIcon size={14} className={css.iconMargin} />
            {t('space.create.title')}
          </Button>
          <Button
            variant="secondary"
            onClick={() => setView('join')}
            size="sm"
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <LinkIcon size={14} className={css.iconMargin} />
            {t('space.join.title')}
          </Button>
          <button
            type="button"
            className={css.textLink}
            onClick={() => {
              resetAndClose();
              switchContext('home', null);
              setCreateRoomOpen({ open: true, spaceId: null, spaceName: null });
            }}
          >
            {t('space.join.createRoomInstead')}
          </button>
        </div>
      )}

      {view === 'create' && (
        <div className={css.panel} onKeyDown={handleKeyDown}>
          <Input
            label={t('space.name')}
            placeholder={t('space.namePlaceholder')}
            value={name}
            onChange={(e) => setName(e.target.value)}
            data-dialog-autofocus
            maxLength={255}
          />
          <Input
            label={`${t('room.topic')} (${t('common.optional')})`}
            placeholder={t('room.topicPlaceholder')}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <ToggleRow
            label={t('space.create.starterRooms')}
            description={t('space.create.starterRoomsNote')}
            checked={starterRooms}
            onChange={setStarterRooms}
            size="sm"
          />
          <ToggleRow
            label={t('space.create.public')}
            description={t('space.create.publicNote')}
            checked={isPublic}
            onChange={(v) => {
              setIsPublic(v);
              if (!v) setSpaceAlias('');
            }}
            size="sm"
          />
          {isPublic && (
            <Input
              label={t('space.create.roomAddress')}
              placeholder={t('space.create.roomAddressPlaceholder')}
              value={spaceAlias}
              onChange={(e) => setSpaceAlias(e.target.value)}
            />
          )}
          <ToggleRow
            label={t('room.create.federation')}
            description={t('room.create.federationNote')}
            checked={federated}
            onChange={setFederated}
            size="sm"
          />
          {foundersRoomVersion && mx && (
            <FoundersField client={mx} founders={founders} onChange={setFounders} />
          )}
        </div>
      )}

      {view === 'join' && (
        <div className={css.panel} onKeyDown={handleKeyDown}>
          <Input
            label={t('space.join.spaceId')}
            placeholder={t('space.join.spaceIdPlaceholder')}
            value={spaceId}
            onChange={(e) => setSpaceId(e.target.value)}
            data-dialog-autofocus
          />
          <Button
            variant="secondary"
            size="sm"
            onClick={() => {
              resetAndClose();
              setExploreOpen(true);
            }}
            style={{ paddingTop: 12, paddingBottom: 12 }}
          >
            <CompassIcon size={14} className={css.iconMargin} />
            {t('space.join.discoverSpaces')}
          </Button>
        </div>
      )}
    </Modal>
  );
}
