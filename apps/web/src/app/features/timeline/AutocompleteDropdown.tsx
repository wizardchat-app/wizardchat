import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useEffect, useRef } from 'react';
import type { MouseEvent, RefObject } from 'react';
import type { WizardClient as MatrixClient } from '@wizardchat/core';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import { Avatar } from '@/app/components/Avatar';
import { AuthMediaImg } from '@/app/components/AuthMediaImg';
import type { AutocompleteState, Suggestion } from './useAutocomplete';
import { KeyCaps } from '@/app/components/KeyCaps';
import * as css from './AutocompleteDropdown.css';
import { useKeyboardHints } from '@/app/hooks/useKeyboardHints';

interface Props {
  state: AutocompleteState;
  client: MatrixClient;
  onSelect: (suggestion: Suggestion) => void;
  onHover: (index: number) => void;
  anchorRef: RefObject<HTMLDivElement | null>;
  listId: string;
}

export function AutocompleteDropdown({
  state,
  client,
  onSelect,
  onHover,
  anchorRef,
  listId,
}: Props) {
  const { t } = useTranslation();
  const keyboardHints = useKeyboardHints();
  const dropdownRef = useRef<HTMLDivElement | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!state.open || state.suggestions.length === 0) return;
    const el = anchorRef.current;
    const dropdown = dropdownRef.current;
    if (!el || !dropdown) return;
    const cleanup = autoUpdate(el, dropdown, () => {
      if (!anchorRef.current || !dropdownRef.current) return;
      computePosition(anchorRef.current, dropdownRef.current, {
        placement: 'top-start',
        strategy: 'fixed',
        middleware: [offset(4), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        const d = dropdownRef.current;
        const a = anchorRef.current;
        if (!d || !a) return;
        Object.assign(d.style, {
          position: 'fixed',
          left: `${x}px`,
          top: `${y}px`,
          width: `${a.getBoundingClientRect().width}px`,
          visibility: 'visible',
        });
      });
    });
    return cleanup;
  }, [state.open, state.suggestions.length, anchorRef]);

  useEffect(() => {
    if (!state.open) return;
    const container = suggestionsRef.current;
    if (!container) return;
    const el = container.children[state.selectedIndex] as HTMLElement | undefined;
    el?.scrollIntoView({ block: 'nearest' });
  }, [state.open, state.selectedIndex]);

  if (!state.open || state.suggestions.length === 0) return null;

  const headerLabel =
    state.mode === 'emoji'
      ? t('common.emoji')
      : state.mode === 'command'
        ? t('common.commands')
        : state.mode === 'room'
          ? t('nav.rooms')
          : t('common.members');

  const dropdown = (
    <div
      className={css.dropdown}
      ref={dropdownRef}
      style={{ position: 'fixed', visibility: 'hidden' }}
    >
      <div className={css.header}>{headerLabel}</div>

      <div ref={suggestionsRef} className={css.suggestionsList} id={listId} role="listbox">
        {state.suggestions.map((suggestion, i) => {
          const isSelected = i === state.selectedIndex;
          const itemClass = isSelected ? css.itemSelected : css.item;
          const optionProps = {
            id: `${listId}-option-${i}`,
            role: 'option',
            'aria-selected': isSelected,
            tabIndex: -1,
            onMouseDown: (e: MouseEvent<HTMLDivElement>) => {
              e.preventDefault();
              onSelect(suggestion);
            },
            onMouseEnter: () => onHover(i),
          };

          if (suggestion.kind === 'emoji') {
            return (
              <div key={suggestion.char} className={itemClass} {...optionProps}>
                {suggestion.mxcUrl ? (
                  <AuthMediaImg
                    client={client}
                    mxcUrl={suggestion.mxcUrl}
                    alt=""
                    className={css.emojiImg}
                  />
                ) : (
                  <span className={css.emojiChar}>{suggestion.char}</span>
                )}
                <span className={css.emojiName}>:{suggestion.id}:</span>
              </div>
            );
          }

          if (suggestion.kind === 'command') {
            return (
              <div key={suggestion.command} className={itemClass} {...optionProps}>
                <span className={css.emojiName}>/{suggestion.command}</span>
                <span className={css.mentionId}>{suggestion.description(t)}</span>
              </div>
            );
          }

          if (suggestion.kind === 'room-link') {
            return (
              <div key={suggestion.roomId} className={itemClass} {...optionProps}>
                <Avatar
                  name={suggestion.name}
                  mxcUrl={suggestion.avatarMxc}
                  client={client}
                  size="sm"
                />
                <span className={css.mentionName}>{suggestion.name}</span>
                <span className={css.mentionId}>
                  {suggestion.isSpace ? t('explore.typeSpace') : (suggestion.alias ?? '')}
                </span>
              </div>
            );
          }

          if (suggestion.kind === 'room-mention') {
            const roomName = suggestion.label.startsWith('@')
              ? suggestion.label.slice(1)
              : suggestion.label;
            return (
              <div key={suggestion.label} className={itemClass} {...optionProps}>
                <Avatar
                  name={roomName}
                  mxcUrl={suggestion.roomAvatarMxc}
                  client={client}
                  size="sm"
                />
                <span className={css.mentionName}>{roomName}</span>
                <span className={css.mentionId}>{t('timeline.roomMentionNotify')}</span>
              </div>
            );
          }

          // mention
          return (
            <div
              key={suggestion.userId}
              className={itemClass}
              {...optionProps}
              onMouseDown={(e) => {
                e.preventDefault();
                onSelect(suggestion);
              }}
            >
              <Avatar
                name={suggestion.displayName}
                mxcUrl={suggestion.avatarMxc}
                client={client}
                size="sm"
                placeholder="logo"
              />
              <span className={css.mentionName}>{suggestion.displayName}</span>
              <span className={css.mentionId}>{suggestion.userId}</span>
            </div>
          );
        })}
      </div>

      {keyboardHints && (
        <div className={css.hint}>
          <span className={css.hintKey}>
            <KeyCaps keys={['↑', '↓']} size="sm" />
            {t('common.navigate')}
          </span>
          <span className={css.hintKey}>
            <KeyCaps keys={['Tab']} size="sm" /> / <KeyCaps keys={['↵']} size="sm" />
            {t('common.select')}
          </span>
          <span className={css.hintKey}>
            <KeyCaps keys={['Esc']} size="sm" /> {t('common.dismiss')}
          </span>
        </div>
      )}
    </div>
  );

  return createPortal(dropdown, document.body);
}
