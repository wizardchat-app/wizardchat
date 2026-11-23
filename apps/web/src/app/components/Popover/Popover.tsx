import { useRef, useEffect, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import {
  computePosition,
  autoUpdate,
  flip,
  shift,
  offset,
  size,
  type Placement,
} from '@floating-ui/dom';
import * as css from './Popover.css';

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchorRef: RefObject<HTMLElement | null>;
  children: React.ReactNode;
  placement?: Placement;
  role?: string;
  id?: string;
  labelledBy?: string;
  matchAnchorWidth?: boolean;
  contentWidth?: boolean;
  dense?: boolean;
  shiftCrossAxis?: boolean;
  className?: string;
  popoverRef?: RefObject<HTMLDivElement | null>;
  maxHeight?: number;
}

export function Popover({
  open,
  onClose,
  anchorRef,
  children,
  placement = 'bottom-start',
  role = 'menu',
  id,
  labelledBy,
  matchAnchorWidth,
  contentWidth,
  dense,
  shiftCrossAxis,
  className,
  popoverRef: externalRef,
  maxHeight,
}: PopoverProps) {
  const innerRef = useRef<HTMLDivElement>(null);
  const surfaceRef = externalRef ?? innerRef;

  useEffect(() => {
    if (!open || !anchorRef.current || !surfaceRef.current) return;
    const cleanup = autoUpdate(anchorRef.current, surfaceRef.current, () => {
      if (!anchorRef.current?.isConnected || !surfaceRef.current) return;
      const surface = surfaceRef.current;

      const sizing = size({
        padding: 8,
        apply({ availableWidth, availableHeight }) {
          if (matchAnchorWidth) {
            surface.style.minWidth = `${anchorRef.current!.getBoundingClientRect().width}px`;
          }
          surface.style.maxWidth = `${availableWidth}px`;
          surface.style.maxHeight = `${Math.min(availableHeight, maxHeight ?? Infinity)}px`;
        },
      });

      computePosition(anchorRef.current, surface, {
        placement,
        middleware: [offset(8), flip(), shift({ padding: 8, crossAxis: shiftCrossAxis }), sizing],
      }).then(({ x, y }) => {
        Object.assign(surface.style, { left: `${x}px`, top: `${y}px` });
      });
    });
    return cleanup;
  }, [open, placement, anchorRef, surfaceRef, matchAnchorWidth, shiftCrossAxis, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      const el = e.target as Node;
      if (anchorRef.current?.contains(el)) return;
      if (surfaceRef.current?.contains(el)) return;
      onClose();
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [open, onClose, anchorRef, surfaceRef]);

  if (!open) return null;

  return createPortal(
    <div
      ref={surfaceRef}
      id={id}
      role={role}
      data-popover
      aria-labelledby={labelledBy}
      className={[
        css.popover,
        dense ? css.popoverDense : undefined,
        matchAnchorWidth ? css.popoverMatchWidth : undefined,
        contentWidth ? css.popoverContentWidth : undefined,
        className,
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>,
    document.body
  );
}
