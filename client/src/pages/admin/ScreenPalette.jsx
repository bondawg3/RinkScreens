import React, { useState, useEffect, useRef } from 'react';
import Thumbnail from './Thumbnail';
import s from './scheduler.module.css';

// One entry per screen-type tab in the admin, in tab order, using the tab's
// label. Screens whose display_type matches no tab are migrated to "custom"
// server-side (see migrateOrphanScreens in server/db.js), so this list is the
// complete set of screen groups.
export const SCREEN_TYPES = [
  { value: 'games', label: 'Hockey' },
  { value: 'rink_events', label: 'Rink Events' },
  { value: 'figure_skating', label: 'Figure Skating' },
  { value: 'skate', label: 'Public Skate' },
  { value: 'webpage', label: 'Webpage' },
  { value: 'announcement', label: 'Announcements' },
  { value: 'rss', label: 'RSS Feed' },
  { value: 'custom', label: 'Custom' },
];

// Draggable palette of screens grouped under their screen-type heading, with a
// per-type show/hide filter and a 2–4-across density control. Only screens
// visible in the admin (visible !== false) are schedulable; a screen type with
// no visible screens is still listed but greyed out. A card can be added to the
// day three ways: drag it onto the timeline, left-click it while an empty slot
// is armed (pickMode), or right-click it for an "Add to schedule" menu.
export default function ScreenPalette({
  screens, hiddenTypes, density, onToggleType, onSetAllTypes, onDensity, pickMode, onPickScreen,
}) {
  const list = (screens || []).filter((sc) => sc.visible !== false);
  const hidden = new Set(hiddenTypes || []);
  const countOf = (type) => list.filter((sc) => sc.display_type === type).length;
  const allShown = SCREEN_TYPES.every((t) => !hidden.has(t.value));
  const noneShown = SCREEN_TYPES.every((t) => hidden.has(t.value));
  const allRef = useRef(null);
  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = !allShown && !noneShown;
  }, [allShown, noneShown]);

  const [menu, setMenu] = useState(null); // { x, y, screenId }
  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (e) => { if (e.key === 'Escape') setMenu(null); };
    window.addEventListener('click', close);
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('click', close); window.removeEventListener('keydown', onKey); };
  }, [menu]);

  function openMenu(e, screenId) {
    if (!onPickScreen) return;
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY, screenId });
  }

  return (
    <div>
      <div className={s.paletteControls}>
        <label className={s.typeToggle} style={{ fontWeight: 700 }}>
          <input
            ref={allRef}
            type="checkbox"
            checked={allShown}
            onChange={(e) => onSetAllTypes(e.target.checked)}
          />
          All screens
        </label>
        {SCREEN_TYPES.map((t) => {
          const count = countOf(t.value);
          return (
            <label key={t.value} className={s.typeToggle} style={count ? undefined : { opacity: 0.45 }}>
              <input
                type="checkbox"
                checked={!hidden.has(t.value)}
                disabled={!count}
                onChange={() => onToggleType(t.value)}
              />
              {t.label} ({count})
            </label>
          );
        })}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.85rem' }}>
          Columns
          <select value={density} onChange={(e) => onDensity(Number(e.target.value))}>
            {[2, 3, 4].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </span>
      </div>

      {SCREEN_TYPES.filter((t) => !hidden.has(t.value)).map((t) => {
        const group = list.filter((sc) => sc.display_type === t.value);
        const empty = group.length === 0;
        return (
          <div key={t.value} className={s.group} style={empty ? { opacity: 0.45 } : undefined}>
            <div className={s.groupHeading}>{t.label}</div>
            {empty ? (
              <div style={{ fontSize: '0.8rem', color: 'var(--text-light)' }}>No visible screens</div>
            ) : (
              <div className={s.grid} style={{ gridTemplateColumns: `repeat(${density}, 1fr)` }}>
                {group.map((sc) => (
                  <div
                    key={sc.id}
                    className={s.paletteCard + (pickMode ? ' ' + s.pickable : '')}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/screen-id', String(sc.id));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    onClick={() => { if (pickMode && onPickScreen) onPickScreen(sc.id); }}
                    onContextMenu={(e) => openMenu(e, sc.id)}
                    title={pickMode ? `Schedule "${sc.name}" in the selected slot` : `Drag "${sc.name}" onto the timeline, or right-click to add`}
                  >
                    <Thumbnail screenId={sc.id} />
                    <div className={s.paletteName}>{sc.name}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {menu && (
        <ul
          className={s.contextMenu}
          style={{ top: menu.y, left: menu.x }}
          onClick={(e) => e.stopPropagation()}
        >
          <li onClick={() => { onPickScreen(menu.screenId); setMenu(null); }}>Add to schedule</li>
        </ul>
      )}
    </div>
  );
}
