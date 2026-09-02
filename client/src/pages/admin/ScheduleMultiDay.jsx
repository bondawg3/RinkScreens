import React from 'react';
import s from './scheduler.module.css';
import ScheduleTimeline from './ScheduleTimeline';

const fmtCol = (dateStr) =>
  new Date(dateStr + 'T00:00:00').toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

// Side-by-side day columns (3-day and week views). Each column is a full
// ScheduleTimeline bound to one date; the whole grid shares one horizontal
// scroll frame. `byDate` maps 'YYYY-MM-DD' -> engine blocks. `onChangeDay(date,
// blocks)` and `onCopyBlock(fromNothing, payload, startMin, toDate)` are routed
// per column.
export default function ScheduleMultiDay({
  dates, byDate, screensById, onChangeDay, onCopyToDay, pendingSlot, onSlotClick, zoom,
}) {
  return (
    <div className={s.multiScroll}>
      <div className={s.multiGrid} style={{ gridTemplateColumns: `repeat(${dates.length}, minmax(190px, 1fr))` }}>
        {dates.map((d) => (
          <div key={d} className={s.multiCol}>
            <div className={s.multiColHead}>{fmtCol(d)}</div>
            <ScheduleTimeline
              blocks={byDate[d] || []}
              screensById={screensById}
              onChange={(blocks) => onChangeDay(d, blocks)}
              pendingSlot={pendingSlot && pendingSlot.date === d ? pendingSlot.min : null}
              onSlotClick={(min) => onSlotClick({ date: d, min })}
              zoom={zoom}
              scroll={false}
              onCopyBlock={(payload, startMin) => onCopyToDay(payload, startMin, d)}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
