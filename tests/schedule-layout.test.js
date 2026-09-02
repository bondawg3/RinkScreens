import { describe, it, expect } from 'vitest';
import {
  toMin, toHHMM, snap15, defaultBlockAt, placeBlock, resizeBlock,
  applyPlacement, firstFreeSlot, addDays, weekRange, DAY_END,
} from '../client/src/pages/admin/scheduleLayout.js';

// Terse block builder: b(9,10) => 09:00–10:00
const b = (sh, eh, id = null, screen_id = 1) => ({ id, screen_id, start: sh * 60, end: eh * 60 });

describe('time helpers', () => {
  it('converts HH:MM and 24:00 both ways', () => {
    expect(toMin('09:15')).toBe(555);
    expect(toMin('24:00')).toBe(1440);
    expect(toHHMM(555)).toBe('09:15');
    expect(toHHMM(1440)).toBe('24:00');
  });

  it('snap15 rounds down to the containing slot', () => {
    expect(snap15(557)).toBe(555); // 09:17 -> 09:15
    expect(snap15(540)).toBe(540);
  });
});

describe('defaultBlockAt', () => {
  it('is one hour from the dropped slot', () => {
    expect(defaultBlockAt(9 * 60)).toEqual({ start: 540, end: 600 });
  });
  it('snaps the drop to the containing 15-min slot', () => {
    expect(defaultBlockAt(9 * 60 + 17)).toEqual({ start: 555, end: 615 });
  });
  it('shifts start up so it never crosses midnight', () => {
    expect(defaultBlockAt(23 * 60 + 30)).toEqual({ start: DAY_END - 60, end: DAY_END });
  });
});

describe('placeBlock', () => {
  it('adds a non-overlapping block untouched', () => {
    const r = placeBlock([b(9, 10, 1)], b(11, 12, null, 2));
    expect(r.ok).toBe(true);
    expect(r.blocks).toHaveLength(2);
  });

  it('shifts a clashing block down toward free space', () => {
    // existing 09:00–10:00; drop 09:00–10:00 -> existing pushed to 10:00–11:00
    const existing = [b(9, 10, 1)];
    const r = placeBlock(existing, { screen_id: 2, start: 540, end: 600 });
    expect(r.ok).toBe(true);
    const moved = r.blocks.find((x) => x.id === 1);
    expect([moved.start, moved.end]).toEqual([600, 660]);
  });

  it('shifts up when the block sits above the candidate midpoint', () => {
    // existing 09:00–10:00; drop 09:30–10:30 -> existing pushed up to 08:30–09:30
    const r = placeBlock([b(9, 10, 1)], { screen_id: 2, start: 570, end: 630 });
    expect(r.ok).toBe(true);
    const moved = r.blocks.find((x) => x.id === 1);
    expect([moved.start, moved.end]).toEqual([510, 570]);
  });

  it('cascades a shift through an adjacent block', () => {
    // 09:00–10:00 and 10:00–11:00; drop 09:00–10:00 pushes both down
    const r = placeBlock([b(9, 10, 1), b(10, 11, 2)], { screen_id: 3, start: 540, end: 600 });
    expect(r.ok).toBe(true);
    const one = r.blocks.find((x) => x.id === 1);
    const two = r.blocks.find((x) => x.id === 2);
    expect([one.start, one.end]).toEqual([600, 660]);
    expect([two.start, two.end]).toEqual([660, 720]);
  });

  it('prompts replace when full and the drop target is ≥ the candidate', () => {
    // whole day occupied by one 00:00–24:00 block; drop a 1h block
    const r = placeBlock([{ id: 1, screen_id: 1, start: 0, end: DAY_END }], { screen_id: 2, start: 540, end: 600 });
    expect(r).toEqual({ ok: false, reason: 'replace', targetId: 1 });
  });

  it('snaps back (nofit) when full and the drop target is smaller', () => {
    // day packed with 15-min blocks around the drop; target smaller than 1h candidate
    const packed = [];
    for (let m = 0; m < DAY_END; m += 15) packed.push({ id: m, screen_id: 1, start: m, end: m + 15 });
    const r = placeBlock(packed, { screen_id: 2, start: 540, end: 600 });
    expect(r).toEqual({ ok: false, reason: 'nofit' });
  });
});

describe('firstFreeSlot', () => {
  it('is midnight on an empty day', () => {
    expect(firstFreeSlot([])).toBe(0);
  });
  it('finds the first hour-long gap between blocks', () => {
    // 00:00–09:00 busy, then free; next gap big enough starts at 09:00
    expect(firstFreeSlot([b(0, 9, 1), b(12, 24, 2)])).toBe(9 * 60);
  });
  it('skips gaps shorter than the requested length', () => {
    // only a 30-min gap at 09:30, then open from 13:00
    expect(firstFreeSlot([b(0, 9.5, 1), b(10, 13, 2)])).toBe(13 * 60);
  });
  it('returns null when the day has no room', () => {
    expect(firstFreeSlot([b(0, 24, 1)])).toBeNull();
  });
});

describe('applyPlacement', () => {
  it('returns the packed layout on a plain add', () => {
    const next = applyPlacement([b(9, 10, 1)], { screen_id: 2, start: 660, end: 720 }, () => false, () => {});
    expect(next).toHaveLength(2);
  });
  it('evicts the target block when the user confirms a replace', () => {
    const day = [{ id: 1, screen_id: 1, start: 0, end: DAY_END }];
    const next = applyPlacement(day, { screen_id: 2, start: 540, end: 600 }, () => true, () => {});
    expect(next).toEqual([{ screen_id: 2, start: 540, end: 600 }]);
  });
  it('aborts (null) and calls onNoFit when replace is declined', () => {
    const day = [{ id: 1, screen_id: 1, start: 0, end: DAY_END }];
    let noFit = false;
    const next = applyPlacement(day, { screen_id: 2, start: 540, end: 600 }, () => false, () => { noFit = true; });
    expect(next).toBeNull();
    expect(noFit).toBe(true);
  });
});

describe('resizeBlock', () => {
  const blocks = [b(9, 10, 1), b(11, 12, 2)];

  it('extends the end edge up to the next neighbour', () => {
    expect(resizeBlock(blocks, 1, 'end', 11 * 60 + 30)).toEqual({ start: 540, end: 660 }); // clamped to 11:00
  });
  it('moves the start edge but not past the previous neighbour or min size', () => {
    // block 2 starts at 10:30; dragging its start to 09:30 clamps to 10:00 (prev block's end)
    expect(resizeBlock([b(9, 10, 1), { id: 2, screen_id: 1, start: 630, end: 720 }], 2, 'start', 9 * 60 + 30)).toEqual({ start: 600, end: 720 });
    expect(resizeBlock(blocks, 1, 'start', 9 * 60 + 55)).toEqual({ start: 585, end: 600 }); // min 15 -> 09:45
  });
  it('returns null when nothing changes', () => {
    expect(resizeBlock(blocks, 1, 'end', 10 * 60)).toBeNull();
  });
});

describe('date helpers', () => {
  it('addDays crosses month boundaries', () => {
    expect(addDays('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDays('2026-08-01', -1)).toBe('2026-07-31');
  });
  it('weekRange respects the week-start choice', () => {
    // 2026-07-08 is a Wednesday
    expect(weekRange('2026-07-08', 0)).toEqual({ start: '2026-07-05', end: '2026-07-11' }); // Sun–Sat
    expect(weekRange('2026-07-08', 1)).toEqual({ start: '2026-07-06', end: '2026-07-12' }); // Mon–Sun
  });
});
