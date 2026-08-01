import React, { useEffect, useRef, useState } from 'react';
import { useApi } from '../../hooks/useApi';
import styles from './AdminTab.module.css';
import s from './TvPreviewTab.module.css';

// Common TV / display resolutions worth spot-checking layout against.
const PRESETS = [
  { label: '1080p — 1920×1080', w: 1920, h: 1080 },
  { label: '720p — 1280×720', w: 1280, h: 720 },
  { label: '4K — 3840×2160', w: 3840, h: 2160 },
  { label: '1366×768', w: 1366, h: 768 },
  { label: '1024×768', w: 1024, h: 768 },
];

// Renders the exact tv.html code a physical TV runs (via /tv/screen/:id) at a
// chosen fixed resolution, scaled down to fit the panel — so layout/overflow
// issues on a given TV size can be checked without resizing the whole browser
// window or deploying to a real screen.
export default function TvPreviewTab() {
  const { data: screens } = useApi('/screens');
  const [screenId, setScreenId] = useState('');
  const [presetIdx, setPresetIdx] = useState(0);
  const [isCustom, setIsCustom] = useState(false);
  const [customW, setCustomW] = useState(1920);
  const [customH, setCustomH] = useState(1080);
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    if (screens && screens.length && !screenId) setScreenId(screens[0].id);
  }, [screens, screenId]);

  const width = Math.max(200, isCustom ? Number(customW) || 1920 : PRESETS[presetIdx].w);
  const height = Math.max(200, isCustom ? Number(customH) || 1080 : PRESETS[presetIdx].h);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => { if (el.offsetWidth) setScale(Math.min(el.offsetWidth / width, 1)); };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [width]);

  const src = screenId ? `/tv/screen/${screenId}` : null;

  return (
    <div>
      <h2 className={styles.heading}>TV Preview</h2>
      <p className={styles.hint}>
        Renders the exact plain-HTML code a physical TV loads (<code className={styles.mono}>/tv/screen/:id</code>),
        at a fixed resolution of your choosing — so you can check how a screen actually lays out on a given TV size
        without resizing your browser window or deploying to a real TV.
      </p>

      <div className={s.controls}>
        <div className={styles.field}>
          <label className={styles.label}>Screen</label>
          <select
            className={styles.select}
            value={screenId}
            onChange={(e) => setScreenId(Number(e.target.value))}
          >
            {(screens || []).map((sc) => (
              <option key={sc.id} value={sc.id}>{sc.name}</option>
            ))}
          </select>
        </div>

        <div className={styles.field}>
          <label className={styles.label}>Resolution</label>
          <select
            className={styles.select}
            value={isCustom ? 'custom' : presetIdx}
            onChange={(e) => {
              if (e.target.value === 'custom') setIsCustom(true);
              else { setIsCustom(false); setPresetIdx(Number(e.target.value)); }
            }}
          >
            {PRESETS.map((p, i) => (
              <option key={i} value={i}>{p.label}</option>
            ))}
            <option value="custom">Custom…</option>
          </select>
        </div>

        {isCustom && (
          <>
            <div className={styles.field}>
              <label className={styles.label}>Width</label>
              <input
                className={styles.input}
                type="number"
                min="200"
                style={{ minWidth: 100 }}
                value={customW}
                onChange={(e) => setCustomW(e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Height</label>
              <input
                className={styles.input}
                type="number"
                min="200"
                style={{ minWidth: 100 }}
                value={customH}
                onChange={(e) => setCustomH(e.target.value)}
              />
            </div>
          </>
        )}

        {src && (
          <a href={src} target="_blank" rel="noreferrer" className={styles.btnGhost} style={{ alignSelf: 'flex-end' }}>
            Open in new tab ↗
          </a>
        )}
      </div>

      <div className={s.meta}>{width}×{height} · scaled to {Math.round(scale * 100)}% to fit this panel</div>

      <div
        className={s.previewWrap}
        ref={wrapRef}
        style={{ '--preview-scale': scale, '--preview-w': `${width}px`, '--preview-h': `${height}px` }}
      >
        {src ? (
          <iframe key={`${src}-${width}-${height}`} src={src} title="TV Preview" scrolling="no" />
        ) : (
          <span className={s.empty}>No screens configured yet.</span>
        )}
      </div>
    </div>
  );
}
