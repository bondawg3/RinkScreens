import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import adminStyles from './AdminTab.module.css';
import tStyles from './ScreensTab.module.css';
import s from './AnnouncementTab.module.css';
import Thumbnail from './Thumbnail';
import { useScreenCards, InUseBadge, EyeButton, EyeHint, DuplicateButton } from './screenCard';
import { FONTS, makeId, hexToRgba, AutoFitText, StackedBoxText, LinesEditor, Section, useUndo, ResizeHandles } from './SlideEditorShared';

const TOKENS = [
  { key: 'title', label: 'Title' },
  { key: 'description', label: 'Description' },
  { key: 'pubDate', label: 'Date' },
];

function defaultElements() {
  return [
    { id: makeId(), type: 'text', text: '{{title}}', color: '#ffffff', font: 'Arial', size: 72, bold: true, align: 'center', x: 50, y: 15, boxWidth: 80, boxHeight: 14 },
    { id: makeId(), type: 'image', filename: '{{image}}', width: 40, height: 24, autoFocal: true, focalX: 50, focalY: 50, x: 50, y: 45, borderWidth: 0, borderColor: '#ffffff' },
    { id: makeId(), type: 'text', text: '{{description}}', color: '#ffffff', font: 'Arial', size: 40, bold: false, align: 'center', x: 50, y: 78, boxWidth: 80, boxHeight: 22 },
  ];
}

// ── Feed management ──────────────────────────────────────────────────────────
function FeedManager({ feeds, reload }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [pollMinutes, setPollMinutes] = useState(15);
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  async function addFeed() {
    if (!name.trim() || !url.trim()) { setErr('Name and URL are required.'); return; }
    setSaving(true);
    setErr('');
    try {
      await apiFetch('/rss-feeds', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), url: url.trim(), poll_interval_minutes: Number(pollMinutes) }),
      });
      setName('');
      setUrl('');
      reload();
    } catch (ex) { setErr(ex.message); }
    setSaving(false);
  }

  async function syncFeed(id) {
    await apiFetch(`/rss-feeds/${id}/sync`, { method: 'POST' });
    reload();
  }

  async function deleteFeed(id) {
    if (!confirm('Delete this feed? Any screens using it will show no items.')) return;
    await apiFetch(`/rss-feeds/${id}`, { method: 'DELETE' });
    reload();
  }

  return (
    <div className={adminStyles.settingsForm} style={{ marginBottom: '1.5rem' }}>
      <h3 className={adminStyles.subheading}>Feeds</h3>
      <table className={adminStyles.table}>
        <thead>
          <tr><th>Name</th><th>URL</th><th>Poll (min)</th><th>Items</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {(feeds || []).map((f) => (
            <tr key={f.id}>
              <td>{f.name}</td>
              <td style={{ maxWidth: '260px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.url}</td>
              <td>{f.poll_interval_minutes}</td>
              <td>{(f.items || []).length}</td>
              <td>
                {f.last_sync_error
                  ? <span style={{ color: '#ff8080' }} title={f.last_sync_error}>Error</span>
                  : f.last_sync_at ? <span style={{ color: '#7fd88f' }}>OK</span> : <span>Pending…</span>}
              </td>
              <td>
                <button className={adminStyles.btnGhost} onClick={() => syncFeed(f.id)} title="Sync now">↻</button>
                <button className={adminStyles.btnDanger} onClick={() => deleteFeed(f.id)} title="Delete">🗑</button>
              </td>
            </tr>
          ))}
          {(!feeds || feeds.length === 0) && (
            <tr><td colSpan={6} className={adminStyles.muted}>No feeds yet.</td></tr>
          )}
        </tbody>
      </table>

      <div className={adminStyles.rowBetween} style={{ marginTop: '0.75rem', gap: '0.5rem', flexWrap: 'wrap' }}>
        <input className={adminStyles.input} placeholder="Feed name" value={name} onChange={e => setName(e.target.value)} />
        <input className={adminStyles.input} placeholder="https://example.com/feed.xml" value={url} onChange={e => setUrl(e.target.value)} style={{ flex: 1, minWidth: '220px' }} />
        <input
          className={adminStyles.input}
          type="number" min="1" style={{ width: '80px' }}
          value={pollMinutes}
          onChange={e => setPollMinutes(e.target.value)}
          title="Poll interval (minutes)"
        />
        <button className={adminStyles.btnPrimary} onClick={addFeed} disabled={saving}>+ Add Feed</button>
      </div>
      {err && <div style={{ color: '#ff8080', fontSize: '0.85rem', marginTop: '0.4rem' }}>{err}</div>}
    </div>
  );
}

// ── Canvas Editor ──────────────────────────────────────────────────────────
function Editor({ screen, backgrounds, feeds, onSave, onCancel }) {
  const [name, setName] = useState(screen.name || '');
  // Multiple templates cycle round-robin by feed-item index (item 0 uses
  // template 0, item 1 uses template 1, item 2 wraps back to template 0,
  // etc.) so consecutive slides don't all look identical. Falls back to the
  // screen's old single rss_slide_layout as a one-template list, or a fresh
  // default template for a brand-new screen.
  const [templates, setTemplates] = useState(() => {
    if (screen.rss_templates?.length) return screen.rss_templates;
    const legacyElements = screen.rss_slide_layout?.elements?.length ? screen.rss_slide_layout.elements : defaultElements();
    // Background is per-template now; a screen saved before that existed
    // has its background at the screen level, so fold it into template 1.
    return [{
      id: makeId(), name: 'Template 1', elements: legacyElements,
      bgColor: screen.bg_color || '', bgColorAlpha: screen.bg_color_alpha ?? 100,
      bgFilename: screen.bg_filename || '', bgLabel: screen.bg_label || '', bgOpacity: screen.bg_opacity ?? 100,
    }];
  });
  const [activeTemplateIdx, setActiveTemplateIdx] = useState(0);
  const activeTemplate = templates[activeTemplateIdx] || {};
  const elements = activeTemplate.elements || [];
  function setElements(updater) {
    setTemplates(prev => prev.map((t, i) => i === activeTemplateIdx
      ? { ...t, elements: typeof updater === 'function' ? updater(t.elements) : updater }
      : t));
  }
  function updateTemplate(changes) {
    setTemplates(prev => prev.map((t, i) => i === activeTemplateIdx ? { ...t, ...changes } : t));
  }
  // One or more source feeds; when more than one is selected, "per feed"
  // takes N items from each (interleaved so the rotation mixes sources)
  // while "total by date" merges every selected feed's items and keeps only
  // the N most recent overall.
  const [feedIds, setFeedIds] = useState(() => screen.rss_feed_ids?.length ? screen.rss_feed_ids : (screen.rss_feed_id ? [screen.rss_feed_id] : []));
  const [multiMode, setMultiMode] = useState(screen.rss_multi_mode || 'per_feed');
  const [itemCount, setItemCount] = useState(screen.rss_item_count ?? 10);
  const [rotateSeconds, setRotateSeconds] = useState(screen.rss_rotate_seconds ?? 8);
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canvasRef = useRef(null);
  const canvasOuterRef = useRef(null);
  const dragRef = useRef(null);

  // Snapshots the whole templates array + which one is active, not just the
  // current template's elements — so undo correctly restores state even if
  // the user switched templates in between (rather than pasting an old
  // template's elements into whichever template happens to be selected now).
  const pushHistory = useUndo(
    useCallback(() => ({ idx: activeTemplateIdx, templates }), [activeTemplateIdx, templates]),
    useCallback((snap) => { setActiveTemplateIdx(snap.idx); setTemplates(snap.templates); }, [])
  );

  const [canvasWidth, setCanvasWidth] = useState(800);
  useEffect(() => {
    if (!canvasOuterRef.current) return;
    setCanvasWidth(canvasOuterRef.current.offsetWidth);
    const obs = new ResizeObserver(() => {
      if (canvasOuterRef.current) setCanvasWidth(canvasOuterRef.current.offsetWidth);
    });
    obs.observe(canvasOuterRef.current);
    return () => obs.disconnect();
  }, []);
  const scale = canvasWidth / 1920;

  useEffect(() => {
    function onMove(e) {
      if (!dragRef.current || !canvasRef.current) return;
      const d = dragRef.current;
      const rect = canvasRef.current.getBoundingClientRect();
      const dx = (e.clientX - d.startMX) / rect.width * 100;
      const dy = (e.clientY - d.startMY) / rect.height * 100;
      const newX = Math.round(Math.max(0, Math.min(100, d.startX + dx)) * 10) / 10;
      const newY = Math.round(Math.max(0, Math.min(100, d.startY + dy)) * 10) / 10;
      setElements(prev => prev.map(el =>
        el.id === d.id ? { ...el, x: newX, y: newY } : el
      ));
    }
    function onUp() { dragRef.current = null; }
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  function startDrag(e, el) {
    e.preventDefault();
    e.stopPropagation();
    setSelectedId(el.id);
    pushHistory();
    dragRef.current = { id: el.id, startMX: e.clientX, startMY: e.clientY, startX: el.x, startY: el.y };
  }

  function updateEl(id, changes) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...changes } : el));
  }

  function addText() {
    const el = { id: makeId(), type: 'text', text: '{{title}}', size: 54, bold: false, y: 50, color: '#ffffff', font: 'Arial', align: 'center', x: 50 };
    pushHistory();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function addFeedImage() {
    const el = { id: makeId(), type: 'image', filename: '{{image}}', width: 25, height: 15, autoFocal: true, focalX: 50, focalY: 50, x: 50, y: 50, borderWidth: 0, borderColor: '#ffffff' };
    pushHistory();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function addStaticImage(filename) {
    if (!filename) return;
    const el = { id: makeId(), type: 'image', filename, width: 25, x: 50, y: 50, borderWidth: 0, borderColor: '#ffffff' };
    pushHistory();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function insertToken(id, token) {
    const el = elements.find(e => e.id === id);
    if (!el) return;
    updateEl(id, { text: (el.text || '') + `{{${token}}}` });
  }

  function selectTemplate(idx) {
    setActiveTemplateIdx(idx);
    setSelectedId(null); // element ids/selection belong to whichever template was showing
  }

  function addTemplate() {
    pushHistory();
    const el = { id: makeId(), name: `Template ${templates.length + 1}`, elements: defaultElements() };
    setTemplates(prev => [...prev, el]);
    selectTemplate(templates.length);
  }

  function duplicateTemplate(idx) {
    pushHistory();
    const copy = { ...templates[idx], id: makeId(), name: `${templates[idx].name} Copy`, elements: templates[idx].elements.map(el => ({ ...el, id: makeId() })) };
    const next = templates.slice();
    next.splice(idx + 1, 0, copy);
    setTemplates(next);
    selectTemplate(idx + 1);
  }

  function renameTemplate(idx, name) {
    setTemplates(prev => prev.map((t, i) => i === idx ? { ...t, name } : t));
  }

  function deleteTemplate(idx) {
    if (templates.length <= 1) return;
    if (!confirm(`Delete "${templates[idx].name}"? Items will keep cycling through the remaining templates.`)) return;
    pushHistory();
    const next = templates.filter((_, i) => i !== idx);
    setTemplates(next);
    selectTemplate(Math.min(activeTemplateIdx, next.length - 1));
  }

  function deleteEl(id) {
    pushHistory();
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const selectedEl = elements.find(e => e.id === selectedId) || null;
  const bgImages = (backgrounds || []).filter(b => (b.image_type || 'background') === 'background');
  const generalImages = (backgrounds || []).filter(b => b.image_type === 'general');

  function toggleFeed(id) {
    setFeedIds(prev => prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]);
  }

  async function handleSave() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    if (!feedIds.length) { setErr('Choose at least one feed.'); return; }
    setSaving(true);
    setErr('');
    const body = {
      name: name.trim(),
      display_type: 'rss',
      rss_feed_ids: feedIds.map(Number),
      rss_multi_mode: multiMode,
      rss_item_count: Number(itemCount),
      rss_rotate_seconds: Number(rotateSeconds),
      rss_slide_layout: { elements: templates[0]?.elements || [] },
      rss_templates: templates,
    };
    try {
      if (screen.id) {
        await apiFetch(`/screens/${screen.id}`, { method: 'PATCH', body: JSON.stringify(body) });
      } else {
        await apiFetch('/screens', { method: 'POST', body: JSON.stringify(body) });
      }
      onSave();
    } catch (ex) { setErr(ex.message); setSaving(false); }
  }

  return (
    <div className={s.editorOverlay}>
      <div className={s.editorHeader}>
        <span className={s.editorTitle}>RSS Slide Editor</span>
        <input
          className={s.editorNameInput}
          placeholder="Screen name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>Ctrl+Z to undo</span>
        {err && <span style={{ color: '#ff8080', fontSize: '0.85rem' }}>{err}</span>}
        <button className={adminStyles.btnGhost} onClick={onCancel} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Cancel</button>
        <button className={adminStyles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      <div className={s.editorBody}>
        <div className={s.canvasCol}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
            {templates.map((t, idx) => (
              <div
                key={t.id || idx}
                onClick={() => selectTemplate(idx)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.6rem', borderRadius: '6px', cursor: 'pointer',
                  background: idx === activeTemplateIdx ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)',
                  border: idx === activeTemplateIdx ? '1px solid rgba(255,255,255,0.4)' : '1px solid transparent',
                }}
              >
                <input
                  value={t.name}
                  onChange={e => renameTemplate(idx, e.target.value)}
                  onClick={e => e.stopPropagation()}
                  style={{
                    background: 'transparent', border: 'none', color: '#fff', fontSize: '0.85rem',
                    fontWeight: idx === activeTemplateIdx ? 700 : 400, width: Math.max(60, t.name.length * 7) + 'px',
                  }}
                />
                <button type="button" className={s.deleteBtnDark} onClick={e => { e.stopPropagation(); duplicateTemplate(idx); }} title="Duplicate template">⧉</button>
                {templates.length > 1 && (
                  <button type="button" className={s.deleteBtnDark} onClick={e => { e.stopPropagation(); deleteTemplate(idx); }} title="Delete template">✕</button>
                )}
              </div>
            ))}
            <button type="button" className={adminStyles.btnGhost} onClick={addTemplate} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>
              + Add Template
            </button>
          </div>
          {templates.length > 1 && (
            <div style={{ color: 'rgba(255,255,255,0.45)', fontSize: '0.78rem' }}>
              Feed items cycle through these templates in order (item 1 → {templates[0]?.name}, item 2 → {templates[1]?.name}
              {templates.length > 2 ? `, …, item ${templates.length} → ${templates[templates.length - 1]?.name}, then back to ${templates[0]?.name}` : ', then back'}) — breaks up the visual instead of repeating one layout every slide.
            </div>
          )}
          <div className={s.canvasOuter} ref={canvasOuterRef} style={{ backgroundColor: activeTemplate.bgColor ? hexToRgba(activeTemplate.bgColor, activeTemplate.bgColorAlpha) : '#0a2a42' }}>
            <div
              className={s.canvas}
              ref={canvasRef}
              onClick={e => { if (e.target === canvasRef.current) setSelectedId(null); }}
            >
              <div
                className={s.canvasBg}
                style={{
                  backgroundImage: activeTemplate.bgFilename ? `url(/uploads/${activeTemplate.bgFilename})` : 'none',
                  opacity: (activeTemplate.bgOpacity ?? 100) / 100,
                }}
              />
              {elements.map(el => (
                <div
                  key={el.id}
                  className={s.canvasEl + (selectedId === el.id ? ' ' + s.canvasElSelected : '')}
                  style={{ left: el.x + '%', top: el.y + '%' }}
                  onMouseDown={e => startDrag(e, el)}
                >
                  {el.type === 'text' ? (
                    el.boxWidth && el.boxHeight ? (
                      <div style={{
                        position: 'relative',
                        width: Math.round(el.boxWidth / 100 * canvasWidth) + 'px',
                        height: Math.round(el.boxHeight / 100 * canvasWidth * 0.5625) + 'px',
                      }}>
                        {el.lines && el.lines.length ? <StackedBoxText el={el} scale={scale} /> : <AutoFitText el={el} scale={scale} />}
                        {selectedId === el.id && (
                          <ResizeHandles el={el} widthKey="boxWidth" heightKey="boxHeight" canvasRef={canvasRef} updateEl={updateEl} pushHistory={pushHistory} />
                        )}
                      </div>
                    ) : (
                      <span style={{
                        color: el.color,
                        fontFamily: el.font + ', sans-serif',
                        fontSize: Math.round(el.size * scale) + 'px',
                        fontWeight: el.bold ? 'bold' : 'normal',
                        textAlign: el.align,
                        whiteSpace: 'pre-wrap',
                        display: 'block',
                        lineHeight: 1.2,
                        pointerEvents: 'none',
                      }}>{el.text || ' '}</span>
                    )
                  ) : el.filename === '{{image}}' ? (
                    <div style={{
                      position: 'relative',
                      width: Math.round(el.width / 100 * canvasWidth) + 'px',
                      height: Math.round((el.height || el.width * 0.6) / 100 * canvasWidth * 0.5625) + 'px',
                      border: el.borderWidth
                        ? `${Math.round(el.borderWidth * scale)}px solid ${el.borderColor || '#fff'}`
                        : '2px dashed rgba(255,255,255,0.4)',
                      boxSizing: 'border-box',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'rgba(255,255,255,0.5)', fontSize: '0.75rem',
                    }}>
                      Feed Image
                      {el.autoFocal === false && (
                        <div title="Manual focal point" style={{
                          position: 'absolute',
                          left: (el.focalX ?? 50) + '%',
                          top: (el.focalY ?? 50) + '%',
                          width: '10px', height: '10px', marginLeft: '-5px', marginTop: '-5px',
                          borderRadius: '50%', background: '#ffcc00', border: '1px solid #000',
                        }} />
                      )}
                      {selectedId === el.id && (
                        <ResizeHandles el={el} widthKey="width" heightKey="height" canvasRef={canvasRef} updateEl={updateEl} pushHistory={pushHistory} />
                      )}
                    </div>
                  ) : (
                    <img
                      src={`/uploads/${el.filename}`}
                      style={{
                        width: Math.round(el.width / 100 * canvasWidth) + 'px',
                        display: 'block',
                        boxSizing: 'border-box',
                        border: el.borderWidth ? `${Math.round(el.borderWidth * scale)}px solid ${el.borderColor || '#fff'}` : 'none',
                      }}
                      draggable={false}
                      alt=""
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className={s.propsPanel}>
          <Section title="Feeds">
            <div className={s.propLabel}>Sources ({feedIds.length} selected)</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '140px', overflowY: 'auto' }}>
              {(feeds || []).map(f => (
                <label key={f.id} className={s.checkRow}>
                  <input type="checkbox" checked={feedIds.includes(f.id)} onChange={() => toggleFeed(f.id)} />
                  {f.name}
                </label>
              ))}
              {(!feeds || feeds.length === 0) && (
                <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.82rem' }}>No feeds yet — add one below.</span>
              )}
            </div>

            {feedIds.length > 1 && (
              <>
                <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>How to combine multiple feeds</div>
                <div className={s.alignToggle}>
                  <button type="button" className={multiMode === 'per_feed' ? s.alignActive : s.alignBtn} onClick={() => setMultiMode('per_feed')}>Per Feed</button>
                  <button type="button" className={multiMode === 'total' ? s.alignActive : s.alignBtn} onClick={() => setMultiMode('total')}>Total (by date)</button>
                </div>
                <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>
                  {multiMode === 'total'
                    ? 'The count below is a total across all selected feeds combined, newest first.'
                    : 'The count below applies to each feed — with 3 feeds and a count of 5, that\'s 15 slides, interleaved so sources are mixed rather than shown one feed at a time.'}
                </div>
              </>
            )}

            <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>
              {feedIds.length > 1 && multiMode === 'total' ? 'Total items to cycle through' : feedIds.length > 1 ? 'Items per feed' : 'Items to cycle through'}
            </div>
            <input
              className={s.numInput}
              type="number" min="1" max="50"
              value={itemCount}
              onChange={e => setItemCount(Number(e.target.value))}
            />

            <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Seconds per slide</div>
            <input
              className={s.numInput}
              type="number" min="2" max="120"
              value={rotateSeconds}
              onChange={e => setRotateSeconds(Number(e.target.value))}
            />
          </Section>

          <Section title={`Background — ${activeTemplate.name || 'Template'}`}>
            <div className={s.propLabel} style={{ marginBottom: '0.2rem' }}>Each template has its own background.</div>
            <div className={s.colorSwatches}>
              {['#000000','#0d1b2a','#1a1a2e','#0a3d62','#154360','#1a5276',
                '#4a235a','#6c3483','#78281f','#922b21','#1e8449','#1b4f72',
                '#7d6608','#784212','#424242','#ffffff'].map(c => (
                <button
                  key={c}
                  className={s.swatch + (activeTemplate.bgColor === c ? ' ' + s.swatchActive : '')}
                  style={{ backgroundColor: c }}
                  onClick={() => updateTemplate({ bgColor: c })}
                  title={c}
                />
              ))}
            </div>
            <div className={s.propRow} style={{ marginTop: '0.4rem' }}>
              <input
                type="color"
                className={s.colorInput}
                value={activeTemplate.bgColor || '#000000'}
                onChange={e => updateTemplate({ bgColor: e.target.value })}
              />
              <input
                className={s.propInput}
                placeholder="#000000"
                value={activeTemplate.bgColor || ''}
                onChange={e => updateTemplate({ bgColor: e.target.value })}
                style={{ fontFamily: 'monospace', flex: 1 }}
              />
              {activeTemplate.bgColor && (
                <button className={s.deleteBtnDark} onClick={() => updateTemplate({ bgColor: '' })} title="Clear color">✕</button>
              )}
            </div>
            <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Color Transparency — {activeTemplate.bgColorAlpha ?? 100}%</div>
            <input
              type="range" min="0" max="100" step="5"
              value={activeTemplate.bgColorAlpha ?? 100}
              onChange={e => updateTemplate({ bgColorAlpha: Number(e.target.value) })}
              style={{ width: '100%' }}
            />
            <select
              className={s.propSelect}
              value={activeTemplate.bgFilename || ''}
              onChange={e => {
                const b = bgImages.find(im => im.filename === e.target.value);
                updateTemplate({ bgFilename: b ? b.filename : '', bgLabel: b ? b.label : '' });
              }}
              style={{ marginTop: '0.4rem' }}
            >
              <option value="">None</option>
              {bgImages.map(b => <option key={b.id} value={b.filename}>{b.label}</option>)}
            </select>
            {activeTemplate.bgFilename && (
              <>
                <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Image Opacity — {activeTemplate.bgOpacity ?? 100}%</div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={activeTemplate.bgOpacity ?? 100}
                  onChange={e => updateTemplate({ bgOpacity: Number(e.target.value) })}
                  style={{ width: '100%' }}
                />
              </>
            )}
          </Section>

          <Section title="Add Element">
            <div className={s.addBtns}>
              <button className={s.addBtn} onClick={addText}>+ Text</button>
              <button className={s.addBtn} onClick={addFeedImage}>+ Feed Image</button>
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <select
                className={s.propSelect}
                defaultValue=""
                onChange={e => { addStaticImage(e.target.value); e.target.value = ''; }}
              >
                <option value="" disabled>+ Add Static Image…</option>
                {generalImages.length === 0 && <option disabled>— No general images uploaded —</option>}
                {generalImages.map(b => <option key={b.id} value={b.filename}>{b.label}</option>)}
              </select>
            </div>
          </Section>

          {selectedEl ? (
            <Section
              title={selectedEl.type === 'text' ? 'Text' : selectedEl.filename === '{{image}}' ? 'Feed Image' : 'Image'}
              extra={<button className={s.deleteBtnDark} onClick={() => deleteEl(selectedId)}>Remove</button>}
            >
              {selectedEl.type === 'text' && (
                <>
                  {!(selectedEl.boxWidth && selectedEl.boxHeight && selectedEl.lines && selectedEl.lines.length) && (
                    <>
                      <div>
                        <div className={s.propLabel}>Text (insert tokens below)</div>
                        <textarea
                          className={s.propTextarea}
                          value={selectedEl.text}
                          onChange={e => updateEl(selectedId, { text: e.target.value })}
                        />
                        <div className={s.addBtns} style={{ marginTop: '0.25rem' }}>
                          {TOKENS.map(t => (
                            <button key={t.key} className={s.addBtn} onClick={() => insertToken(selectedId, t.key)}>
                              + {t.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div>
                        <div className={s.propLabel}>Font</div>
                        <select
                          className={s.propSelect}
                          value={selectedEl.font}
                          onChange={e => updateEl(selectedId, { font: e.target.value })}
                        >
                          {FONTS.map(f => (
                            <option key={f} value={f} style={{ fontFamily: f }}>{f}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <div className={s.propLabel}>Size — {selectedEl.size}px{selectedEl.boxWidth && selectedEl.boxHeight ? ' (max)' : ''}</div>
                        <div className={s.propRow}>
                          <input
                            type="range" min="12" max="200" step="4"
                            value={selectedEl.size}
                            onChange={e => updateEl(selectedId, { size: Number(e.target.value) })}
                          />
                          <input
                            className={s.numInput}
                            type="number" min="4" max="400"
                            value={selectedEl.size}
                            onChange={e => updateEl(selectedId, { size: Number(e.target.value) })}
                          />
                        </div>
                      </div>

                      <div className={s.propRow}>
                        <div>
                          <div className={s.propLabel}>Color</div>
                          <input
                            type="color"
                            className={s.colorInput}
                            value={selectedEl.color}
                            onChange={e => updateEl(selectedId, { color: e.target.value })}
                          />
                        </div>
                        <div>
                          <div className={s.propLabel}>Bold</div>
                          <label className={s.checkRow}>
                            <input
                              type="checkbox"
                              checked={selectedEl.bold}
                              onChange={e => updateEl(selectedId, { bold: e.target.checked })}
                            />
                            Bold
                          </label>
                        </div>
                      </div>

                      <div>
                        <div className={s.propLabel}>Align</div>
                        <div className={s.alignToggle}>
                          {['left', 'center', 'right'].map(a => (
                            <button
                              key={a}
                              type="button"
                              className={selectedEl.align === a ? s.alignActive : s.alignBtn}
                              onClick={() => updateEl(selectedId, { align: a })}
                            >
                              {a === 'left' ? '⇤' : a === 'center' ? '⇔' : '⇥'}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}

                  <div>
                    <label className={s.checkRow}>
                      <input
                        type="checkbox"
                        checked={!!(selectedEl.boxWidth && selectedEl.boxHeight)}
                        onChange={e => updateEl(selectedId, e.target.checked
                          ? { boxWidth: selectedEl.boxWidth || 40, boxHeight: selectedEl.boxHeight || 20 }
                          : { boxWidth: undefined, boxHeight: undefined })}
                      />
                      Bounding box (auto-fit text)
                    </label>
                    {selectedEl.boxWidth && selectedEl.boxHeight && (
                      <div style={{ marginTop: '0.4rem' }}>
                        <div className={s.propLabel} style={{ marginBottom: '0.2rem' }}>
                          Size above is a max — it shrinks (and wraps, if the box is tall enough) to fit. Recommended for {'{{'}description{'}}'} since article lengths vary.
                          Drag the yellow handles on the canvas to resize.
                        </div>
                        <div className={s.propLabel}>Box Width — {selectedEl.boxWidth}%</div>
                        <div className={s.propRow}>
                          <input
                            type="range" min="5" max="100" step="5"
                            value={selectedEl.boxWidth}
                            onChange={e => updateEl(selectedId, { boxWidth: Number(e.target.value) })}
                          />
                        </div>
                        <div className={s.propLabel}>Box Height — {selectedEl.boxHeight}%</div>
                        <div className={s.propRow}>
                          <input
                            type="range" min="5" max="100" step="5"
                            value={selectedEl.boxHeight}
                            onChange={e => updateEl(selectedId, { boxHeight: Number(e.target.value) })}
                          />
                        </div>
                        <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>Vertical Alignment</div>
                        <div className={s.alignToggle}>
                          {[['top', '⤒'], ['middle', '↕'], ['bottom', '⤓']].map(([v, icon]) => (
                            <button
                              key={v}
                              type="button"
                              className={(selectedEl.boxJustify || 'middle') === v ? s.alignActive : s.alignBtn}
                              onClick={() => updateEl(selectedId, { boxJustify: v })}
                            >
                              {icon}
                            </button>
                          ))}
                        </div>
                        <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>Padding — {selectedEl.boxPadding || 0}px</div>
                        <div className={s.propRow}>
                          <input
                            type="range" min="0" max="100" step="2"
                            value={selectedEl.boxPadding || 0}
                            onChange={e => updateEl(selectedId, { boxPadding: Number(e.target.value) })}
                          />
                        </div>
                        <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>Box Background Color</div>
                        <div className={s.propRow}>
                          <input
                            type="color"
                            className={s.colorInput}
                            value={selectedEl.boxColor || '#000000'}
                            onChange={e => updateEl(selectedId, { boxColor: e.target.value })}
                          />
                          {selectedEl.boxColor && (
                            <button className={s.deleteBtnDark} onClick={() => updateEl(selectedId, { boxColor: undefined })} title="Clear">✕</button>
                          )}
                        </div>
                        {selectedEl.boxColor && (
                          <>
                            <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>Box Color Opacity — {selectedEl.boxAlpha ?? 100}%</div>
                            <input
                              type="range" min="0" max="100" step="5"
                              value={selectedEl.boxAlpha ?? 100}
                              onChange={e => updateEl(selectedId, { boxAlpha: Number(e.target.value) })}
                              style={{ width: '100%' }}
                            />
                          </>
                        )}

                        <label className={s.checkRow} style={{ marginTop: '0.4rem' }}>
                          <input
                            type="checkbox"
                            checked={!!(selectedEl.lines && selectedEl.lines.length)}
                            onChange={e => updateEl(selectedId, e.target.checked
                              ? { lines: (selectedEl.lines && selectedEl.lines.length) ? selectedEl.lines : [
                                  { id: makeId(), text: selectedEl.text || '', font: selectedEl.font || 'Arial', size: selectedEl.size || 36, color: selectedEl.color || '#ffffff', bold: !!selectedEl.bold, align: selectedEl.align || 'center' },
                                ] }
                              : { lines: undefined })}
                          />
                          Use multiple styled lines (mail-merge)
                        </label>
                        {selectedEl.lines && selectedEl.lines.length ? (
                          <div style={{ marginTop: '0.4rem' }}>
                            <div className={s.propLabel} style={{ marginBottom: '0.3rem' }}>
                              Each line has its own font/size/color/alignment and can bind to a
                              different feed field. The whole stack shrinks together to fit the box.
                            </div>
                            <div className={s.propLabel}>Line Spacing — {selectedEl.lineSpacing || 0}px</div>
                            <div className={s.propRow} style={{ marginBottom: '0.3rem' }}>
                              <input
                                type="range" min="0" max="60" step="1"
                                value={selectedEl.lineSpacing || 0}
                                onChange={e => updateEl(selectedId, { lineSpacing: Number(e.target.value) })}
                              />
                            </div>
                            <LinesEditor lines={selectedEl.lines} onChange={next => updateEl(selectedId, { lines: next })} tokens={TOKENS} />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedEl.type === 'image' && (
                <div>
                  <div className={s.propLabel}>Width — {selectedEl.width}%</div>
                  <div className={s.propRow}>
                    <input
                      type="range" min="5" max="100" step="5"
                      value={selectedEl.width}
                      onChange={e => updateEl(selectedId, { width: Number(e.target.value) })}
                    />
                    <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', minWidth: '32px' }}>
                      {selectedEl.width}%
                    </span>
                  </div>

                  {selectedEl.filename === '{{image}}' && (
                    <>
                      <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>
                        Height — {selectedEl.height ?? Math.round(selectedEl.width * 0.6)}%
                      </div>
                      <div className={s.propRow}>
                        <input
                          type="range" min="5" max="100" step="5"
                          value={selectedEl.height ?? Math.round(selectedEl.width * 0.6)}
                          onChange={e => updateEl(selectedId, { height: Number(e.target.value) })}
                        />
                        <span style={{ color: 'rgba(255,255,255,0.7)', fontSize: '0.82rem', minWidth: '32px' }}>
                          {selectedEl.height ?? Math.round(selectedEl.width * 0.6)}%
                        </span>
                      </div>
                      <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Fit Mode</div>
                      <div className={s.alignToggle}>
                        <button
                          type="button"
                          className={(selectedEl.fitMode || 'cover') === 'cover' ? s.alignActive : s.alignBtn}
                          onClick={() => updateEl(selectedId, { fitMode: 'cover' })}
                        >
                          Crop to Fill
                        </button>
                        <button
                          type="button"
                          className={selectedEl.fitMode === 'contain' ? s.alignActive : s.alignBtn}
                          onClick={() => updateEl(selectedId, { fitMode: 'contain' })}
                        >
                          Fit Whole Image
                        </button>
                      </div>
                      <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>
                        {selectedEl.fitMode === 'contain'
                          ? "The whole image is scaled to fit inside this box (drag the yellow handles to resize it) — it won't be cropped, but may be letterboxed if the item's image doesn't match the box's proportions."
                          : "Every item's image is cropped to fill this box (drag the yellow handles on the canvas to resize it). The interesting part of the image is auto-detected per item, or you can pin it manually below."}
                      </div>
                      {(selectedEl.fitMode || 'cover') === 'cover' && (
                        <label className={s.checkRow} style={{ marginTop: '0.3rem' }}>
                          <input
                            type="checkbox"
                            checked={selectedEl.autoFocal !== false}
                            onChange={e => updateEl(selectedId, { autoFocal: e.target.checked })}
                          />
                          Auto-detect focal point (recommended)
                        </label>
                      )}
                      {(selectedEl.fitMode || 'cover') === 'cover' && selectedEl.autoFocal === false && (
                        <div className={s.propRow} style={{ marginTop: '0.3rem' }}>
                          <div>
                            <div className={s.propLabel}>Focal X%</div>
                            <input
                              className={s.numInput}
                              type="number" min="0" max="100" step="1"
                              value={selectedEl.focalX ?? 50}
                              onChange={e => updateEl(selectedId, { focalX: Number(e.target.value) })}
                            />
                          </div>
                          <div>
                            <div className={s.propLabel}>Focal Y%</div>
                            <input
                              className={s.numInput}
                              type="number" min="0" max="100" step="1"
                              value={selectedEl.focalY ?? 50}
                              onChange={e => updateEl(selectedId, { focalY: Number(e.target.value) })}
                            />
                          </div>
                        </div>
                      )}
                    </>
                  )}

                  <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Border Width — {selectedEl.borderWidth || 0}px</div>
                  <div className={s.propRow}>
                    <input
                      type="range" min="0" max="20" step="1"
                      value={selectedEl.borderWidth || 0}
                      onChange={e => updateEl(selectedId, { borderWidth: Number(e.target.value) })}
                    />
                  </div>
                  {!!selectedEl.borderWidth && (
                    <div>
                      <div className={s.propLabel}>Border Color</div>
                      <input
                        type="color"
                        className={s.colorInput}
                        value={selectedEl.borderColor || '#ffffff'}
                        onChange={e => updateEl(selectedId, { borderColor: e.target.value })}
                      />
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className={s.propLabel}>Position (X / Y %)</div>
                <div className={s.propRow}>
                  <input
                    className={s.numInput}
                    type="number" min="0" max="100" step="1"
                    value={selectedEl.x}
                    onChange={e => updateEl(selectedId, { x: Number(e.target.value) })}
                  />
                  <input
                    className={s.numInput}
                    type="number" min="0" max="100" step="1"
                    value={selectedEl.y}
                    onChange={e => updateEl(selectedId, { y: Number(e.target.value) })}
                  />
                </div>
              </div>
            </Section>
          ) : (
            <div style={{ padding: '1rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.85rem', textAlign: 'center' }}>
              Click an element on the canvas to edit its properties, or add a new element above.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main tab ───────────────────────────────────────────────────────────────
export default function RssTab() {
  const { data: allScreens, reload } = useApi('/screens');
  const { data: backgrounds } = useApi('/backgrounds');
  const { data: displays } = useApi('/displays');
  const { data: feeds, reload: reloadFeeds } = useApi('/rss-feeds');
  const [editingScreen, setEditingScreen] = useState(null);
  const { eyeHint, assignedDisplayName, toggleVisible, deleteScreen, duplicateScreen } =
    useScreenCards({ displays, reload, confirmMessage: 'Delete this RSS screen?' });

  const screens = (allScreens || []).filter(sc => sc.display_type === 'rss');

  if (editingScreen !== null) {
    return (
      <Editor
        screen={editingScreen}
        backgrounds={backgrounds || []}
        feeds={feeds || []}
        onSave={() => { setEditingScreen(null); reload(); }}
        onCancel={() => setEditingScreen(null)}
      />
    );
  }

  return (
    <div>
      <div className={adminStyles.rowBetween}>
        <h2 className={adminStyles.heading}>RSS Feed Screens</h2>
        <button className={adminStyles.btnPrimary} onClick={() => setEditingScreen({})}>+ Add Screen</button>
      </div>

      <FeedManager feeds={feeds} reload={reloadFeeds} />

      <div className={s.grid}>
        {screens.map(sc => (
          <div key={sc.id} className={tStyles.card}>
            <Thumbnail screenId={sc.id} />
            <div className={tStyles.cardBody}>
              <div className={tStyles.cardName}>{sc.name}</div>
              <div className={tStyles.cardMeta}>
                {(() => {
                  const ids = sc.rss_feed_ids?.length ? sc.rss_feed_ids : (sc.rss_feed_id ? [sc.rss_feed_id] : []);
                  const names = ids.map(id => (feeds || []).find(f => f.id === id)?.name).filter(Boolean);
                  return names.length ? names.join(', ') : 'No feed';
                })()}
                {` · ${sc.rss_rotate_seconds ?? 8}s/slide`}
                {sc.rss_templates?.length > 1 ? ` · ${sc.rss_templates.length} templates` : ''}
              </div>
              <InUseBadge name={assignedDisplayName(sc.id)} />
              <div className={tStyles.cardActions}>
                <a href={`/tv/screen/${sc.id}?preview`} target="_blank" rel="noreferrer" className={adminStyles.btnGhost} title="Preview">📺</a>
                <button className={adminStyles.btnGhost} onClick={() => setEditingScreen(sc)} title="Edit">✎</button>
                <EyeButton screen={sc} assignedName={assignedDisplayName(sc.id)} onToggle={toggleVisible} />
                <button className={adminStyles.btnDanger} onClick={() => deleteScreen(sc.id)} title="Delete">🗑</button>
                <DuplicateButton screen={sc} onDuplicate={duplicateScreen} />
              </div>
              <EyeHint show={eyeHint === sc.id} name={assignedDisplayName(sc.id)} />
            </div>
          </div>
        ))}
        {screens.length === 0 && (
          <p className={adminStyles.muted}>No RSS screens yet.</p>
        )}
      </div>
    </div>
  );
}
