import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useAtom } from 'jotai';
import { computePosition, autoUpdate, flip, shift, offset } from '@floating-ui/dom';
import { CheckIcon, CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react';
import { useTranslation } from 'react-i18next';
import { contextMenuAtom, type ContextMenuItem } from './contextMenuAtom';
import { emojiPickerAtom } from '@/app/store/atoms';
import { useMediaQuery } from '@/app/hooks/useMediaQuery';
import * as css from './ContextMenu.css';

const SUBMENU_CLOSE_DELAY = 150;

function enabledIndexes(items: ContextMenuItem[], baseIndex = 0): number[] {
  return items
    .map((item, i) => (item.divider || item.disabled ? -1 : baseIndex + i))
    .filter((i) => i !== -1);
}

export function ContextMenu() {
  const { t } = useTranslation();
  const [menu, setMenu] = useAtom(contextMenuAtom);
  const asSheet = useMediaQuery('(max-width: 768px)');
  const [picker, setPicker] = useAtom(emojiPickerAtom);
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closeTimer = useRef<number | null>(null);
  const [openSubIndex, setOpenSubIndex] = useState<number | null>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [suppressHover, setSuppressHover] = useState(false);
  const activeIndexRef = useRef<number | null>(null);
  const lastMenuRef = useRef(menu);

  const setActive = useCallback((index: number | null) => {
    setActiveIndex(index);
    activeIndexRef.current = index;
  }, []);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const scheduleSubmenuClose = useCallback(() => {
    clearCloseTimer();
    closeTimer.current = window.setTimeout(() => setOpenSubIndex(null), SUBMENU_CLOSE_DELAY);
  }, [clearCloseTimer]);

  const closeMenu = useCallback(() => {
    if (picker?.anchor?.closest('[role="menu"]')) setPicker(null);
    setMenu(null);
    setOpenSubIndex(null);
    setActive(null);
  }, [picker, setPicker, setMenu, setActive]);

  const activateItem = useCallback(
    (item: ContextMenuItem) => {
      if (!item.keepOpen) closeMenu();
      item.onClick(menuRef.current);
    },
    [closeMenu]
  );

  const submenuItems = useMemo(() => {
    if (!menu) return undefined;
    const openItem = openSubIndex !== null ? menu.items[openSubIndex] : undefined;
    return openItem?.submenu;
  }, [menu, openSubIndex]);

  const totalMainCount = menu?.items.length ?? 0;

  const itemAt = useCallback(
    (index: number | null): ContextMenuItem | null => {
      if (!menu || index === null) return null;
      if (index >= 0 && index < totalMainCount) return menu.items[index];
      if (submenuItems && index >= totalMainCount && index < totalMainCount + submenuItems.length) {
        return submenuItems[index - totalMainCount] ?? null;
      }
      return null;
    },
    [menu, submenuItems, totalMainCount]
  );

  const enabledAll = useMemo(() => {
    if (!menu) return [];
    return [...enabledIndexes(menu.items), ...enabledIndexes(submenuItems ?? [], totalMainCount)];
  }, [menu, submenuItems, totalMainCount]);

  // Close on outside click, Escape, or scroll
  useEffect(() => {
    if (!menu) return;

    const isInsidePicker = (target: EventTarget | null): boolean =>
      target instanceof Element && target.closest('[data-emoji-picker]') !== null;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      closeMenu();
    };
    const handleMousedown = (e: MouseEvent) => {
      if (!isInsidePicker(e.target)) closeMenu();
    };
    const handleContextmenu = (e: MouseEvent) => {
      if (!isInsidePicker(e.target)) closeMenu();
    };
    const handleScroll = (e: Event) => {
      if (e.target instanceof Node && menuRef.current?.contains(e.target)) return;
      if (!isInsidePicker(e.target)) closeMenu();
    };
    const handleBlur = () => closeMenu();

    document.addEventListener('mousedown', handleMousedown);
    document.addEventListener('contextmenu', handleContextmenu);
    document.addEventListener('keydown', handleKeyDown);
    window.addEventListener('blur', handleBlur);
    window.addEventListener('scroll', handleScroll, true);

    return () => {
      document.removeEventListener('mousedown', handleMousedown);
      document.removeEventListener('contextmenu', handleContextmenu);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('blur', handleBlur);
      window.removeEventListener('scroll', handleScroll, true);
    };
  }, [menu, closeMenu]);

  useLayoutEffect(() => {
    if (!menu || asSheet) return;
    const menuEl = menuRef.current;
    if (!menuEl) return;
    const anchor = menu.anchor;
    const reference: Parameters<typeof computePosition>[0] = {
      getBoundingClientRect: () => ({
        x: anchor.x,
        y: anchor.y,
        top: anchor.y,
        left: anchor.x,
        right: anchor.x + anchor.width,
        bottom: anchor.y + anchor.height,
        width: anchor.width,
        height: anchor.height,
      }),
    };
    const middleware = [offset(8), flip(), shift({ padding: 8, crossAxis: true })];
    return autoUpdate(reference, menuEl, () => {
      if (!menuRef.current) return;
      computePosition(reference, menuRef.current, {
        placement: anchor.placement,
        strategy: 'fixed',
        middleware,
      }).then(({ x, y }) => {
        const current = menuRef.current;
        if (!current) return;
        current.style.left = `${x}px`;
        current.style.top = `${y}px`;
      });
    });
  }, [menu, asSheet]);

  useLayoutEffect(() => {
    if (!menu || asSheet || openSubIndex === null) return;
    const parentEl = itemRefs.current[openSubIndex];
    const subEl = submenuRef.current;
    if (!parentEl || !subEl) return;
    return autoUpdate(parentEl, subEl, () => {
      if (!submenuRef.current) return;
      computePosition(parentEl, submenuRef.current, {
        placement: 'right-start',
        strategy: 'fixed',
        middleware: [offset(6), flip(), shift({ padding: 8 })],
      }).then(({ x, y }) => {
        const current = submenuRef.current;
        if (!current) return;
        current.style.left = `${x}px`;
        current.style.top = `${y}px`;
      });
    });
  }, [menu, asSheet, openSubIndex]);

  useEffect(() => {
    if (!menu) {
      setOpenSubIndex(null);
      setActive(null);
      return;
    }
    menuRef.current?.focus();
  }, [menu, setActive]);

  useEffect(() => {
    if (!menu) return;
    setSuppressHover(true);
    const onPointerMove = () => setSuppressHover(false);
    document.addEventListener('pointermove', onPointerMove, { once: true });
    return () => document.removeEventListener('pointermove', onPointerMove);
  }, [menu]);

  useEffect(() => {
    const prev = lastMenuRef.current;
    lastMenuRef.current = menu;
    if (prev && !menu) {
      const opener = prev.opener;
      if (opener && opener.isConnected && typeof opener.focus === 'function') {
        requestAnimationFrame(() => {
          const active = document.activeElement;
          const focusLost = !active || active === document.body;
          if (focusLost && document.hasFocus()) opener.focus({ preventScroll: true });
        });
      }
    }
  }, [menu]);

  useEffect(() => {
    return () => {
      if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    };
  }, []);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const enabled = enabledAll;
    if (enabled.length === 0) return;

    const current = activeIndexRef.current;
    const currentPos = current !== null ? enabled.indexOf(current) : -1;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActive(
          currentPos >= 0 ? enabled[Math.min(currentPos + 1, enabled.length - 1)] : enabled[0]
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActive(currentPos > 0 ? enabled[currentPos - 1] : enabled[enabled.length - 1]);
        break;
      case 'Home':
        e.preventDefault();
        setActive(enabled[0]);
        break;
      case 'End':
        e.preventDefault();
        setActive(enabled[enabled.length - 1]);
        break;
      case 'ArrowRight': {
        const item = itemAt(current);
        if (item?.submenu && !item.disabled && openSubIndex !== current) {
          e.preventDefault();
          setOpenSubIndex(current);
          const sub = enabledIndexes(item.submenu, totalMainCount);
          setActive(sub[0] ?? current);
        }
        break;
      }
      case 'ArrowLeft': {
        if (openSubIndex !== null) {
          e.preventDefault();
          setOpenSubIndex(null);
          setActive(openSubIndex);
        }
        break;
      }
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const item = itemAt(current);
        if (!item) break;
        if (item.submenu && !item.disabled) {
          setOpenSubIndex(current);
          const sub = enabledIndexes(item.submenu, totalMainCount);
          setActive(sub[0] ?? current);
        } else {
          activateItem(item);
        }
        break;
      }
      case 'Escape':
        if (openSubIndex !== null) {
          e.preventDefault();
          e.stopPropagation();
          setOpenSubIndex(null);
        }
        break;
      default:
        break;
    }

    if (activeIndexRef.current !== current) {
      itemRefs.current[activeIndexRef.current ?? -1]?.focus();
    }
  };

  if (!menu) return null;

  const openItem = openSubIndex !== null ? menu.items[openSubIndex] : undefined;
  const submenu = openItem?.submenu;
  const menuLabel = t('common.menu');

  const renderItems = (items: ContextMenuItem[], baseIndex: number, closeHover = false) =>
    items.map((item, i) => {
      if (item.divider) {
        return <div key={i} className={css.menuDivider} role="separator" />;
      }
      const absoluteIndex = baseIndex + i;
      const isSubmenuParent = !!item.submenu && !item.disabled;
      const isActive = activeIndex === absoluteIndex;
      const baseClass = item.disabled
        ? css.menuItemDisabled
        : item.danger
          ? css.menuItemDanger
          : css.menuItem;
      const activeClass =
        isActive && !item.disabled
          ? item.danger
            ? css.menuItemDangerActive
            : css.menuItemActive
          : '';

      return (
        <div
          key={i}
          ref={(el) => {
            itemRefs.current[absoluteIndex] = el;
          }}
          className={[baseClass, activeClass].filter(Boolean).join(' ')}
          role={item.checked ? 'menuitemcheckbox' : 'menuitem'}
          aria-checked={item.checked ? 'true' : undefined}
          aria-disabled={item.disabled || undefined}
          aria-haspopup={isSubmenuParent ? 'menu' : undefined}
          tabIndex={-1}
          onFocus={() => setActive(absoluteIndex)}
          onMouseEnter={() => {
            if (asSheet) return;
            if (isSubmenuParent) {
              clearCloseTimer();
              setOpenSubIndex(absoluteIndex);
              return;
            }
            if (closeHover && openSubIndex !== null) scheduleSubmenuClose();
          }}
          onMouseLeave={() => {
            if (isSubmenuParent) scheduleSubmenuClose();
          }}
          onClick={() => {
            if (item.disabled) return;
            if (isSubmenuParent) {
              setOpenSubIndex(absoluteIndex);
              return;
            }
            activateItem(item);
          }}
        >
          {item.icon && <span className={css.menuItemIcon}>{item.icon}</span>}
          <span className={css.menuItemLabel}>{item.label}</span>
          {(item.submenu || item.chevron) && (
            <CaretRightIcon size={12} weight="bold" className={css.menuItemCarat} />
          )}
          {item.checked && <CheckIcon size={14} weight="bold" className={css.menuItemCheck} />}
        </div>
      );
    });

  if (asSheet) {
    return (
      <>
        <div
          className={css.sheetBackdrop}
          role="presentation"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={closeMenu}
        />
        <div
          ref={menuRef}
          className={css.sheet}
          role="menu"
          aria-label={menuLabel}
          tabIndex={-1}
          onKeyDown={handleKeyDown}
          onMouseDown={(e) => e.stopPropagation()}
          onMouseUp={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <div className={css.sheetHandle} />
          {submenu && openItem ? (
            <>
              <div
                className={css.menuItem}
                role="menuitem"
                tabIndex={-1}
                onClick={() => setOpenSubIndex(null)}
              >
                <span className={css.menuItemIcon}>
                  <CaretLeftIcon size={14} />
                </span>
                <span className={css.menuItemLabel}>{openItem.label}</span>
              </div>
              <div className={css.menuDivider} role="separator" />
              {renderItems(submenu, totalMainCount)}
            </>
          ) : (
            renderItems(menu.items, 0)
          )}
        </div>
      </>
    );
  }

  return (
    <div
      ref={menuRef}
      className={css.menu}
      data-suppress-hover={suppressHover ? 'true' : undefined}
      role="menu"
      aria-label={menuLabel}
      tabIndex={-1}
      onKeyDown={handleKeyDown}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      {renderItems(menu.items, 0, true)}

      {submenu && openSubIndex !== null && (
        <div
          ref={submenuRef}
          className={css.menuSubmenu}
          role="menu"
          aria-label={menuLabel}
          tabIndex={-1}
          onMouseEnter={() => clearCloseTimer()}
          onMouseLeave={() => scheduleSubmenuClose()}
        >
          {renderItems(submenu, totalMainCount)}
        </div>
      )}
    </div>
  );
}
