import { useState, useRef, useEffect, useCallback, cloneElement, memo } from 'react';
import { createPortal } from 'react-dom';
import {
  computePosition,
  autoUpdate,
  flip,
  shift,
  offset,
  arrow,
  type Placement,
} from '@floating-ui/dom';
import { useCoarsePointer } from '@/app/hooks/useCoarsePointer';
import * as css from './Tooltip.css';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  placement?: Placement;
  delay?: number;
  closeOnPointerDown?: boolean;
  multiline?: boolean;
}

const staticSideMap = {
  top: 'bottom',
  right: 'left',
  bottom: 'top',
  left: 'right',
} as const;

const WARM_MS = 300;
let lastHiddenAt = 0;

const arrowClassMap: Record<string, string | undefined> = {
  top: css.arrowDown,
  bottom: css.arrowUp,
  right: css.arrowLeft,
  left: css.arrowRight,
};

export const Tooltip = memo(function Tooltip({
  content,
  children,
  placement = 'bottom',
  delay = 300,
  closeOnPointerDown = true,
  multiline = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const visibleRef = useRef(false);
  visibleRef.current = visible;
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const pointerInsideRef = useRef(false);
  const lastPointerAtRef = useRef(0);
  const suppressedRef = useRef(false);
  const leftAtRef = useRef(0);
  const triggerRef = useRef<HTMLElement | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const arrowRef = useRef<HTMLDivElement>(null);
  const coarse = useCoarsePointer();

  useEffect(() => {
    const onPointerDown = () => {
      lastPointerAtRef.current = Date.now();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!visible || !triggerRef.current || !tooltipRef.current) return;

    const cleanup = autoUpdate(triggerRef.current, tooltipRef.current, () => {
      if (!triggerRef.current || !tooltipRef.current) return;
      computePosition(triggerRef.current, tooltipRef.current, {
        placement,
        middleware: [
          offset(8),
          flip(),
          shift({ padding: 8 }),
          arrow({ element: arrowRef.current! }),
        ],
      }).then(({ x, y, middlewareData, placement: computedPlacement }) => {
        Object.assign(tooltipRef.current!.style, {
          left: `${x}px`,
          top: `${y}px`,
        });

        const arrowData = middlewareData.arrow;
        if (arrowData && arrowRef.current) {
          const base = computedPlacement.split('-')[0] as keyof typeof staticSideMap;
          const side = staticSideMap[base];
          Object.assign(arrowRef.current.style, {
            left: arrowData.x != null ? `${arrowData.x}px` : '',
            top: arrowData.y != null ? `${arrowData.y}px` : '',
            right: '',
            bottom: '',
            [side]: '-4px',
          });

          for (const cls of [css.arrowUp, css.arrowDown, css.arrowLeft, css.arrowRight]) {
            arrowRef.current.classList.remove(cls);
          }
          const arrowCls = arrowClassMap[base];
          if (arrowCls) arrowRef.current.classList.add(arrowCls);
        }
      });
    });

    return cleanup;
  }, [visible, placement]);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (Date.now() - lastHiddenAt < WARM_MS) {
      setVisible(true);
      return;
    }
    timerRef.current = setTimeout(() => setVisible(true), delay);
  }, [delay]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (visibleRef.current) lastHiddenAt = Date.now();
    setVisible(false);
  }, []);

  useEffect(() => {
    if (!visible) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      suppressedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
      setVisible(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [visible]);

  const setTriggerRef = useCallback((node: HTMLElement | null) => {
    triggerRef.current = node;
  }, []);

  type ChildProps = {
    ref?: React.Ref<HTMLElement>;
    onMouseEnter?: (e: React.MouseEvent) => void;
    onMouseLeave?: (e: React.MouseEvent) => void;
    onPointerEnter?: (e: React.PointerEvent) => void;
    onPointerLeave?: (e: React.PointerEvent) => void;
    onPointerDown?: (e: React.PointerEvent) => void;
    onContextMenu?: (e: React.MouseEvent) => void;
    onFocus?: (e: React.FocusEvent) => void;
    onBlur?: (e: React.FocusEvent) => void;
  };

  const child = children as React.ReactElement<ChildProps>;

  const trigger = cloneElement(child, {
    ref: setTriggerRef,
    onMouseEnter(e: React.MouseEvent) {
      child.props.onMouseEnter?.(e);
      if (!suppressedRef.current) show();
    },
    onMouseLeave(e: React.MouseEvent) {
      child.props.onMouseLeave?.(e);
      hide();
    },
    onPointerEnter(e: React.PointerEvent) {
      child.props.onPointerEnter?.(e);
      pointerInsideRef.current = true;
      if (Date.now() - leftAtRef.current > 250) suppressedRef.current = false;
    },
    onPointerLeave(e: React.PointerEvent) {
      child.props.onPointerLeave?.(e);
      pointerInsideRef.current = false;
      leftAtRef.current = Date.now();
      hide();
    },
    onPointerDown(e: React.PointerEvent) {
      child.props.onPointerDown?.(e);
      lastPointerAtRef.current = Date.now();
      if (closeOnPointerDown) {
        suppressedRef.current = true;
        hide();
      } else if (timerRef.current) {
        clearTimeout(timerRef.current);
        setVisible(true);
      }
    },
    onContextMenu(e: React.MouseEvent) {
      child.props.onContextMenu?.(e);
      lastPointerAtRef.current = Date.now();
      suppressedRef.current = true;
      hide();
    },
    onFocus(e: React.FocusEvent) {
      child.props.onFocus?.(e);
      if (
        !suppressedRef.current &&
        !pointerInsideRef.current &&
        Date.now() - lastPointerAtRef.current > 500
      ) {
        show();
      }
    },
    onBlur(e: React.FocusEvent) {
      child.props.onBlur?.(e);
      hide();
    },
  });

  if (coarse) {
    // Touch/coarse-pointer devices: render the trigger without hover/focus
    // tooltip injection. The child already carries an accessible label.
    return <>{children}</>;
  }

  return (
    <>
      {trigger}
      {visible &&
        createPortal(
          <div
            ref={tooltipRef}
            role="tooltip"
            className={
              multiline ? `${css.tooltipPortal} ${css.tooltipMultiline}` : css.tooltipPortal
            }
          >
            {content}
            <div ref={arrowRef} className={css.arrow} />
          </div>,
          document.body
        )}
    </>
  );
});
