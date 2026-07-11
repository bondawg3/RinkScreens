import React, { useState, useEffect, useRef } from 'react';
import s from './Thumbnail.module.css';

// Scaled-down live iframe of a TV screen. Pass previewDate (YYYY-MM-DD) to
// preview a specific day; pass no screenId to render an empty placeholder.
export default function Thumbnail({ screenId, previewDate }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.2);

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

  if (!screenId) {
    return (
      <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', position: 'absolute' }}>No screen assigned</span>
      </div>
    );
  }

  const src = previewDate ? `/tv/screen/${screenId}?preview_date=${previewDate}` : `/tv/screen/${screenId}`;
  return (
    <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale }}>
      <iframe key={src} src={src} title={`Screen ${screenId}`} scrolling="no" />
    </div>
  );
}
