import React from 'react';
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
  { value: 'custom', label: 'Custom' },
];

// Draggable palette of screens grouped under their screen-type heading, with a
// per-type show/hide filter and a 2–4-across density control. Only screens
// visible in the admin (visible !== false) are schedulable; a screen type with
// no visible screens is still listed but greyed out. Dragging a card carries
// its screen id via dataTransfer for the timeline's drop handler.
export default function ScreenPalette({ screens, hiddenTypes, density, onToggleType, onDensity }) {
  const list = (screens || []).filter((sc) => sc.visible !== false);
  const hidden = new Set(hiddenTypes || []);
  const countOf = (type) => list.filter((sc) => sc.display_type === type).length;

  return (
    <div>
      <div className={s.paletteControls}>
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
                    className={s.paletteCard}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('text/screen-id', String(sc.id));
                      e.dataTransfer.effectAllowed = 'copy';
                    }}
                    title={`Drag "${sc.name}" onto the timeline`}
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
    </div>
  );
}
