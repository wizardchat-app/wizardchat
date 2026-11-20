import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import * as css from './RoomReorder.css';

export interface ReorderRow {
  id: string;
  kind: 'room' | 'header';
  group: string | null;
  section: string | null;
  anchor?: string;
  blockedGroup?: string;
}

interface InsertLine {
  id: string;
  position: 'before' | 'after';
}

const ReorderContext = createContext<{ insertLine: InsertLine | null }>({ insertLine: null });

interface RoomReorderProviderProps {
  rows: ReorderRow[];
  onReorder: (section: string, orderedIds: string[], movedId: string) => void;
  onMoveRoom?: (roomId: string, group: string) => void;
  onReorderSections?: (orderedAnchors: string[]) => void;
  onActiveChange?: (id: string | null) => void;
  onDropGroupChange?: (group: string | null) => void;
  renderOverlay: (id: string) => ReactNode;
  children: ReactNode;
}

type Plan =
  | { kind: 'reorder'; section: string; ids: string[]; line: InsertLine }
  | { kind: 'move'; group: string }
  | { kind: 'sections'; anchors: string[]; line: InsertLine }
  | null;

export function RoomReorderProvider({
  rows,
  onReorder,
  onMoveRoom,
  onReorderSections,
  onActiveChange,
  onDropGroupChange,
  renderOverlay,
  children,
}: RoomReorderProviderProps) {
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));
  const [activeId, setActiveId] = useState<string | null>(null);
  const [insertLine, setInsertLine] = useState<InsertLine | null>(null);
  const [dropGroup, setDropGroup] = useState<string | null>(null);
  useEffect(() => onDropGroupChange?.(dropGroup), [dropGroup, onDropGroupChange]);

  const byId = useMemo(() => new Map(rows.map((r, i) => [r.id, { row: r, index: i }])), [rows]);

  const anchorOf = useCallback(
    (id: string): string | null => {
      const hit = byId.get(id);
      if (!hit) return null;
      for (let i = hit.index; i >= 0; i--) {
        const row = rows[i];
        if (row.kind !== 'header') continue;
        return row.anchor ?? null;
      }
      return null;
    },
    [byId, rows]
  );
  const anchorRow = useCallback(
    (anchor: string) => rows.find((r) => r.kind === 'header' && r.anchor === anchor)?.id ?? null,
    [rows]
  );
  const anchors = useMemo(() => {
    const list: string[] = [];
    for (const row of rows) {
      if (row.kind !== 'header') continue;
      if (row.anchor && !list.includes(row.anchor)) list.push(row.anchor);
    }
    return list;
  }, [rows]);

  const plan = useCallback(
    (active: string, over: string | null): Plan => {
      const from = byId.get(active)?.row;
      const to = over ? byId.get(over)?.row : undefined;
      if (!from || !to || active === over) return null;

      if (from.kind === 'header') {
        const source = from.anchor;
        const target = anchorOf(to.id);
        if (!source || !target || source === target) return null;
        const a = anchors.indexOf(source);
        const b = anchors.indexOf(target);
        const headerId = anchorRow(target);
        if (a === -1 || b === -1 || !headerId) return null;
        if (a > b) {
          return {
            kind: 'sections',
            anchors: arrayMove(anchors, a, b),
            line: { id: headerId, position: 'before' },
          };
        }
        let end = byId.get(headerId)!.index;
        while (end + 1 < rows.length && rows[end + 1].kind !== 'header') end++;
        return {
          kind: 'sections',
          anchors: arrayMove(anchors, a, b),
          line: { id: rows[end].id, position: 'after' },
        };
      }

      if (to.kind === 'room' && from.section && to.section === from.section) {
        const ids = rows.filter((r) => r.section === from.section).map((r) => r.id);
        const a = ids.indexOf(from.id);
        const b = ids.indexOf(to.id);
        if (a === -1 || b === -1 || a === b) return null;
        return {
          kind: 'reorder',
          section: from.section,
          ids: arrayMove(ids, a, b),
          line: { id: to.id, position: a < b ? 'after' : 'before' },
        };
      }
      if (to.group && to.group !== from.group && to.group !== from.blockedGroup) {
        return { kind: 'move', group: to.group };
      }
      return null;
    },
    [byId, rows, anchors, anchorOf, anchorRow]
  );

  const reset = () => {
    setActiveId(null);
    onActiveChange?.(null);
    setInsertLine(null);
    setDropGroup(null);
  };

  const handleDragStart = (event: DragStartEvent) => {
    setActiveId(String(event.active.id));
    onActiveChange?.(String(event.active.id));
    setInsertLine(null);
    setDropGroup(null);
  };

  const handleDragOver = ({ active, over }: DragOverEvent) => {
    const next = plan(String(active.id), over ? String(over.id) : null);
    setInsertLine(next && next.kind !== 'move' ? next.line : null);
    setDropGroup(next?.kind === 'move' ? next.group : null);
  };

  const handleDragEnd = ({ active, over }: DragEndEvent) => {
    reset();
    const next = plan(String(active.id), over ? String(over.id) : null);
    if (!next) return;
    if (next.kind === 'reorder') onReorder(next.section, next.ids, String(active.id));
    else if (next.kind === 'move') onMoveRoom?.(String(active.id), next.group);
    else onReorderSections?.(next.anchors);
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDragEnd={handleDragEnd}
      onDragCancel={reset}
    >
      <SortableContext items={rows.map((r) => r.id)} strategy={verticalListSortingStrategy}>
        <ReorderContext.Provider value={{ insertLine }}>{children}</ReorderContext.Provider>
      </SortableContext>
      <DragOverlay dropAnimation={null}>
        {activeId && <div className={css.overlay}>{renderOverlay(activeId)}</div>}
      </DragOverlay>
    </DndContext>
  );
}

export function SortableRoomRow({
  roomId,
  disabled,
  children,
}: {
  roomId: string;
  disabled: boolean;
  children: ReactNode;
}) {
  const { listeners, setNodeRef, isDragging } = useSortable({ id: roomId, disabled });
  const { insertLine } = useContext(ReorderContext);
  return (
    <div
      ref={setNodeRef}
      className={css.row}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...(disabled ? {} : listeners)}
    >
      {insertLine?.id === roomId && (
        <div className={css.insertLine} data-position={insertLine.position} />
      )}
      {children}
    </div>
  );
}

export function SortableHeaderRow({
  id,
  draggable,
  children,
}: {
  id: string;
  draggable: boolean;
  children: ReactNode;
}) {
  const { listeners, setNodeRef, isDragging } = useSortable({
    id,
    disabled: { draggable: !draggable, droppable: false },
  });
  const { insertLine } = useContext(ReorderContext);
  return (
    <div
      ref={setNodeRef}
      className={css.row}
      style={{ opacity: isDragging ? 0.4 : 1 }}
      {...(draggable ? listeners : {})}
    >
      {insertLine?.id === id && (
        <div className={css.insertLine} data-position={insertLine.position} />
      )}
      {children}
    </div>
  );
}
