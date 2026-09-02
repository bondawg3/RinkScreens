import React, { useState, useEffect, useRef } from 'react';
import s from './Thumbnail.module.css';

// Scaled-down snapshot of a TV screen. Renders the TV page in `?static=1` mode:
// first slide only, no rotation timers, no periodic reload, no WebSocket — so a
// grid of dozens of these costs almost nothing after first paint. The iframe is
// only mounted once it scrolls near the viewport. Pass previewDate (YYYY-MM-DD)
// to preview a specific day; pass no screenId to render an empty placeholder.
export default function Thumbnail({ screenId, previewDate }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.2);
  const [visible, setVisible] = useState(false);

  // Keep the 1920px-wide iframe scaled to whatever width the wrapper currently
  // is — recomputes when the grid density (and thus cell width) changes, not
  // just on mount, so the whole screen always fits regardless of columns.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => { if (el.offsetWidth) setScale(el.offsetWidth / 1920); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Lazy-mount: don't create the iframe until the card is on (or near) screen.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || visible) return;
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { setVisible(true); io.disconnect(); }
    }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [visible]);

  if (!screenId) {
    return (
      <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', position: 'absolute' }}>No screen assigned</span>
      </div>
    );
  }

  const q = new URLSearchParams({ static: '1' });
  if (previewDate) q.set('preview_date', previewDate);
  const src = `/tv/screen/${screenId}?${q}`;
  return (
    <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale }}>
      {visible && <iframe key={src} src={src} title={`Screen ${screenId}`} scrolling="no" />}
    </div>
  );
}
