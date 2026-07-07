import React, { useState } from 'react';
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
