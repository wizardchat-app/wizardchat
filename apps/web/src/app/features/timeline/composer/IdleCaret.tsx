import { useLayoutEffect, useState } from 'react';
import { ReactEditor } from 'slate-react';
import { Editor, type Descendant } from 'slate';
import type { CustomEditor } from './editor/types';
import * as css from '../Composer.css';

interface IdleCaretProps {
  editor: CustomEditor;
  value: Descendant[];
  boxRef: React.RefObject<HTMLDivElement | null>;
}

interface CaretPos {
  left: number;
  top: number;
  height: number;
}

function measure(editor: CustomEditor, box: HTMLElement): CaretPos | null {
  const editable = box.querySelector<HTMLElement>('[data-slate-editor]');
  if (!editable) return null;
  const boxRect = box.getBoundingClientRect();
  const editableRect = editable.getBoundingClientRect();
  const style = getComputedStyle(editable);
  const lineHeight = parseFloat(style.lineHeight) || parseFloat(style.fontSize) * 1.5;

  let rect: DOMRect | undefined;
  try {
    const end = Editor.end(editor, []);
    const rects = ReactEditor.toDOMRange(editor, { anchor: end, focus: end }).getClientRects();
    rect = rects[rects.length - 1];
  } catch {
    rect = undefined;
  }

  if (!rect || rect.height === 0) {
    return {
      left: editableRect.left - boxRect.left + parseFloat(style.paddingLeft),
      top: editableRect.top - boxRect.top + parseFloat(style.paddingTop),
      height: lineHeight,
    };
  }
  if (rect.bottom < editableRect.top || rect.top > editableRect.bottom) return null;
  const height = Math.min(rect.height, lineHeight);
  return {
    left: rect.right - boxRect.left,
    top: rect.top - boxRect.top + (rect.height - height) / 2,
    height,
  };
}

export function IdleCaret({ editor, value, boxRef }: IdleCaretProps) {
  const [pos, setPos] = useState<CaretPos | null>(null);

  useLayoutEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => setPos(measure(editor, box));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, [editor, value, boxRef]);

  if (!pos) return null;
  return (
    <span
      className={css.idleCaret}
      style={{ left: pos.left, top: pos.top, height: pos.height }}
      aria-hidden="true"
    />
  );
}
