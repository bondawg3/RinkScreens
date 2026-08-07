import React, { useEffect, useMemo, useState } from 'react';
import { PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { apiFetch } from '../../hooks/useApi';
import adminStyles from './AdminTab.module.css';
import s from './ScreensSection.module.css';

// Shared screen-card behavior: which display a screen is assigned to, the
// visibility (eye) toggle with its "in use" hint, and delete-with-confirm.
// Used by ScreensSection, WebpageTab, and AnnouncementTab.
export function useScreenCards({ displays, reload, confirmMessage = 'Delete this screen?' }) {
  const [eyeHint, setEyeHint] = useState(null); // screen id currently showing the hint

  function assignedDisplayName(screenId) {
    return (displays || []).find((d) => d.screen_id === screenId)?.name || null;
  }

  async function toggleVisible(sc) {
    if (assignedDisplayName(sc.id)) {
      setEyeHint(sc.id);
      setTimeout(() => setEyeHint(null), 3000);
      return;
    }
    await apiFetch(`/screens/${sc.id}`, { method: 'PATCH', body: JSON.stringify({ visible: !sc.visible }) });
    reload();
  }

  async function deleteScreen(id) {
    if (!confirm(confirmMessage)) return;
    await apiFetch(`/screens/${id}`, { method: 'DELETE' });
    reload();
  }

  async function duplicateScreen(id) {
    await apiFetch(`/screens/${id}/duplicate`, { method: 'POST' });
    reload();
  }

  return { eyeHint, assignedDisplayName, toggleVisible, deleteScreen, duplicateScreen };
}

export function DuplicateButton({ screen, onDuplicate }) {
  return (
    <button
      className={adminStyles.btnGhost}
      onClick={() => onDuplicate(screen.id)}
      title="Duplicate this screen"
    >⧉</button>
  );
}

export function InUseBadge({ name }) {
  return name ? <div className={s.inUseBadge}>● {name}</div> : null;
}

export function EyeButton({ screen, assignedName, onToggle }) {
  const visible = screen.visible !== false;
  return (
    <button
      className={assignedName ? s.eyeDisabled : visible ? s.eyeOn : s.eyeOff}
      onClick={() => onToggle(screen)}
      title={assignedName
        ? `In use by ${assignedName} — unassign first`
        : visible ? 'Visible in Displays tab — click to hide' : 'Hidden from Displays tab — click to show'}
    >{visible ? '👁' : '🚫'}</button>
  );
}

export function EyeHint({ show, name }) {
  return show ? <div className={s.eyeHintText}>In use by {name} — unassign it first to hide.</div> : null;
}

// Drag-and-drop reordering for a screen list. Keeps an optimistic local order
// while the reorder request is in flight, then defers back to the server's
// order once `screens` reflects it (its id sequence changes to match).
export function useScreenReorder({ screens, reload }) {
  const [localOrder, setLocalOrder] = useState(null);
  const idsKey = screens.map((sc) => sc.id).join(',');

  useEffect(() => { setLocalOrder(null); }, [idsKey]);

  const orderedScreens = useMemo(() => {
    if (!localOrder) return screens;
    const byId = new Map(screens.map((sc) => [sc.id, sc]));
    return localOrder.map((id) => byId.get(id)).filter(Boolean);
  }, [screens, localOrder]);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  async function handleDragEnd(event) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const ids = orderedScreens.map((sc) => sc.id);
    const oldIndex = ids.indexOf(active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(ids, oldIndex, newIndex);
    setLocalOrder(next);
    try {
      await apiFetch('/screens/reorder', { method: 'POST', body: JSON.stringify({ ids: next }) });
    } catch (ex) {
      setLocalOrder(null);
    }
    reload();
  }

  return { orderedScreens, sensors, handleDragEnd };
}

// Wraps a screen card to make it draggable. `children` is a render prop
// receiving the drag-handle props to spread onto a handle button, so drags
// don't fight with the card's other click targets (Edit/Delete/etc).
export function SortableCard({ id, className, draggingClassName, children }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={isDragging ? `${className} ${draggingClassName}` : className}
    >
      {children({ attributes, listeners })}
    </div>
  );
}

export function DragHandle({ attributes, listeners, className }) {
  return (
    <button type="button" className={className} title="Drag to reorder" {...attributes} {...listeners}>
      ⠿
    </button>
  );
}
