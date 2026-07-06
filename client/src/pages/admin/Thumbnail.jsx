import React, { useState, useEffect, useRef } from 'react';
import s from './Thumbnail.module.css';

// Scaled-down live iframe of a TV screen. Pass previewDate (YYYY-MM-DD) to
// preview a specific day; pass no screenId to render an empty placeholder.
export default function Thumbnail({ screenId, previewDate }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    if (!wrapRef.current) return;
    setScale(wrapRef.current.offsetWidth / 1920);
  }, []);

  if (!screenId) {
    return (
      <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.85rem', position: 'absolute' }}>No screen assigned</span>
      </div>
    );
  }

  const src = previewDate ? `/tv/${screenId}?preview_date=${previewDate}` : `/tv/${screenId}`;
  return (
    <div className={s.thumbWrap} ref={wrapRef} style={{ '--thumb-scale': scale }}>
      <iframe key={src} src={src} title={`Screen ${screenId}`} scrolling="no" />
    </div>
  );
}
