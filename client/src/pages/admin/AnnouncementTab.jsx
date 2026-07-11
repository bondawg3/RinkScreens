import React, { useState, useEffect, useRef } from 'react';
import { useApi, apiFetch } from '../../hooks/useApi';
import adminStyles from './AdminTab.module.css';
import tStyles from './ScreensTab.module.css';
import s from './AnnouncementTab.module.css';
import Thumbnail from './Thumbnail';
import { useScreenCards, InUseBadge, EyeButton, EyeHint, DuplicateButton } from './screenCard';

const FONTS = [
  'Arial', 'Verdana', 'Trebuchet MS', 'Georgia',
  'Times New Roman', 'Impact', 'Courier New', 'Palatino Linotype',
];

function makeId() {
  return 'el-' + Math.random().toString(36).slice(2, 9);
}

function defaultElements() {
  return [
    { id: makeId(), type: 'text', text: 'Heading', color: '#ffffff', font: 'Arial', size: 96, bold: true, align: 'center', x: 50, y: 25 },
    { id: makeId(), type: 'text', text: 'Body text goes here', color: '#ffffff', font: 'Arial', size: 54, bold: false, align: 'center', x: 50, y: 50 },
    { id: makeId(), type: 'text', text: 'Footer', color: '#dddddd', font: 'Arial', size: 36, bold: false, align: 'center', x: 50, y: 82 },
  ];
}

// ── Canvas Editor ──────────────────────────────────────────────────────────
function Editor({ screen, backgrounds, onSave, onCancel }) {
  const [name, setName] = useState(screen.name || '');
  const [elements, setElements] = useState(() =>
    screen.announcement_data?.elements?.length
      ? screen.announcement_data.elements
      : defaultElements()
  );
  const [backgroundId, setBackgroundId] = useState(screen.background_id ?? '');
  const [bgOpacity, setBgOpacity] = useState(screen.bg_opacity ?? 100);
  const [bgColor, setBgColor] = useState(screen.bg_color || '');
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canvasRef = useRef(null);
  const canvasOuterRef = useRef(null);
  const dragRef = useRef(null);
  const elementsRef = useRef(elements);
  useEffect(() => { elementsRef.current = elements; }, [elements]);

  // Scale font sizes to canvas width
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

  // Drag support
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
    dragRef.current = { id: el.id, startMX: e.clientX, startMY: e.clientY, startX: el.x, startY: el.y };
  }

  function updateEl(id, changes) {
    setElements(prev => prev.map(el => el.id === id ? { ...el, ...changes } : el));
  }

  function addText(role) {
    const presets = {
      heading: { text: 'Heading', size: 96, bold: true, y: 25 },
      body:    { text: 'Body text', size: 54, bold: false, y: 50 },
      footer:  { text: 'Footer', size: 36, bold: false, y: 82 },
    };
    const preset = presets[role] || presets.body;
    const el = { id: makeId(), type: 'text', ...preset, color: '#ffffff', font: 'Arial', align: 'center', x: 50 };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function addImage(filename) {
    if (!filename) return;
    const el = { id: makeId(), type: 'image', filename, width: 25, x: 50, y: 50 };
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function deleteEl(id) {
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  const selectedEl = elements.find(e => e.id === selectedId) || null;
  const bgFilename = backgrounds?.find(b => b.id === Number(backgroundId))?.filename || null;
  const bgImages = (backgrounds || []).filter(b => (b.image_type || 'background') === 'background');
  const generalImages = (backgrounds || []).filter(b => b.image_type === 'general');

  async function handleSave() {
    if (!name.trim()) { setErr('Name is required.'); return; }
    setSaving(true);
    setErr('');
    const body = {
      name: name.trim(),
      display_type: 'announcement',
      background_id: backgroundId || null,
      bg_opacity: bgOpacity,
      bg_color: bgColor || '',
      announcement_data: { elements },
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
      {/* Header */}
      <div className={s.editorHeader}>
        <span className={s.editorTitle}>Announcement Editor</span>
        <input
          className={s.editorNameInput}
          placeholder="Screen name"
          value={name}
          onChange={e => setName(e.target.value)}
        />
        {err && <span style={{ color: '#ff8080', fontSize: '0.85rem' }}>{err}</span>}
        <button className={adminStyles.btnGhost} onClick={onCancel} style={{ color: '#fff', borderColor: 'rgba(255,255,255,0.3)' }}>Cancel</button>
        <button className={adminStyles.btnPrimary} onClick={handleSave} disabled={saving}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>

      {/* Body */}
      <div className={s.editorBody}>
        {/* Canvas column */}
        <div className={s.canvasCol}>
          <div className={s.canvasOuter} ref={canvasOuterRef} style={{ backgroundColor: bgColor || '#0a2a42' }}>
            <div
              className={s.canvas}
              ref={canvasRef}
              onClick={e => { if (e.target === canvasRef.current) setSelectedId(null); }}
            >
              {/* Background */}
              <div
                className={s.canvasBg}
                style={{
                  backgroundImage: bgFilename ? `url(/uploads/${bgFilename})` : 'none',
                  opacity: bgOpacity / 100,
                }}
              />
              {/* Elements */}
              {elements.map(el => (
                <div
                  key={el.id}
                  className={s.canvasEl + (selectedId === el.id ? ' ' + s.canvasElSelected : '')}
                  style={{ left: el.x + '%', top: el.y + '%' }}
                  onMouseDown={e => startDrag(e, el)}
                >
                  {el.type === 'text' ? (
                    <span style={{
                      color: el.color,
                      fontFamily: el.font + ', sans-serif',
                      fontSize: Math.round(el.size * scale) + 'px',
                      fontWeight: el.bold ? 'bold' : 'normal',
                      textAlign: el.align,
                      whiteSpace: 'pre',
                      display: 'block',
                      lineHeight: 1.2,
                      pointerEvents: 'none',
                    }}>{el.text || ' '}</span>
                  ) : (
                    <img
                      src={`/uploads/${el.filename}`}
                      style={{ width: Math.round(el.width / 100 * canvasWidth) + 'px', display: 'block' }}
                      draggable={false}
                      alt=""
                    />
                  )}
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Properties panel */}
        <div className={s.propsPanel}>
          {/* Background */}
          <div className={s.propSection}>
            <div className={s.propSectionTitle}>Background</div>

            <div className={s.propLabel}>Color</div>
            <div className={s.colorSwatches}>
              {['#000000','#0d1b2a','#1a1a2e','#0a3d62','#154360','#1a5276',
                '#4a235a','#6c3483','#78281f','#922b21','#1e8449','#1b4f72',
                '#7d6608','#784212','#424242','#ffffff'].map(c => (
                <button
                  key={c}
                  className={s.swatch + (bgColor === c ? ' ' + s.swatchActive : '')}
                  style={{ backgroundColor: c }}
                  onClick={() => setBgColor(c)}
                  title={c}
                />
              ))}
            </div>
            <div className={s.propRow} style={{ marginTop: '0.4rem' }}>
              <input
                type="color"
                className={s.colorInput}
                value={bgColor || '#000000'}
                onChange={e => setBgColor(e.target.value)}
              />
              <input
                className={s.propInput}
                placeholder="#000000"
                value={bgColor}
                onChange={e => {
                  const v = e.target.value;
                  setBgColor(v);
                }}
                style={{ fontFamily: 'monospace', flex: 1 }}
              />
              {bgColor && (
                <button className={s.deleteBtnDark} onClick={() => setBgColor('')} title="Clear color">✕</button>
              )}
            </div>

            <select
              className={s.propSelect}
              value={backgroundId}
              onChange={e => setBackgroundId(e.target.value)}
            >
              <option value="">None</option>
              {bgImages.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            {backgroundId && (
              <>
                <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Opacity — {bgOpacity}%</div>
                <input
                  type="range" min="0" max="100" step="5"
                  value={bgOpacity}
                  onChange={e => setBgOpacity(Number(e.target.value))}
                  style={{ width: '100%' }}
                />
              </>
            )}
          </div>

          {/* Add elements */}
          <div className={s.propSection}>
            <div className={s.propSectionTitle}>Add Element</div>
            <div className={s.addBtns}>
              <button className={s.addBtn} onClick={() => addText('heading')}>+ Heading</button>
              <button className={s.addBtn} onClick={() => addText('body')}>+ Body</button>
              <button className={s.addBtn} onClick={() => addText('footer')}>+ Footer</button>
            </div>
            <div style={{ marginTop: '0.25rem' }}>
              <select
                className={s.propSelect}
                defaultValue=""
                onChange={e => { addImage(e.target.value); e.target.value = ''; }}
              >
                <option value="" disabled>+ Add Image…</option>
                {generalImages.length === 0 && <option disabled>— No general images uploaded —</option>}
                {generalImages.map(b => (
                  <option key={b.id} value={b.filename}>{b.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Selected element properties */}
          {selectedEl ? (
            <div className={s.propSection}>
              <div className={s.propSectionTitle}>
                <span>{selectedEl.type === 'text' ? 'Text' : 'Image'}</span>
                <button className={s.deleteBtnDark} onClick={() => deleteEl(selectedId)}>Remove</button>
              </div>

              {selectedEl.type === 'text' && (
                <>
                  <div>
                    <div className={s.propLabel}>Text</div>
                    <textarea
                      className={s.propTextarea}
                      value={selectedEl.text}
                      onChange={e => updateEl(selectedId, { text: e.target.value })}
                    />
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
                    <div className={s.propLabel}>Size — {selectedEl.size}px</div>
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

              {selectedEl.type === 'image' && (
                <>
                  <div>
                    <div className={s.propLabel}>Image</div>
                    <select
                      className={s.propSelect}
                      value={selectedEl.filename}
                      onChange={e => updateEl(selectedId, { filename: e.target.value })}
                    >
                      {(backgrounds || []).map(b => (
                        <option key={b.id} value={b.filename}>{b.label}</option>
                      ))}
                    </select>
                  </div>
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
                  </div>
                </>
              )}

              {/* Position */}
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
            </div>
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
export default function AnnouncementTab() {
  const { data: allScreens, reload } = useApi('/screens');
  const { data: backgrounds } = useApi('/backgrounds');
  const { data: displays } = useApi('/displays');
  const [editingScreen, setEditingScreen] = useState(null);
  const { eyeHint, assignedDisplayName, toggleVisible, deleteScreen, duplicateScreen } =
    useScreenCards({ displays, reload, confirmMessage: 'Delete this announcement screen?' });

  const screens = (allScreens || []).filter(sc => sc.display_type === 'announcement');

  if (editingScreen !== null) {
    return (
      <Editor
        screen={editingScreen}
        backgrounds={backgrounds || []}
        onSave={() => { setEditingScreen(null); reload(); }}
        onCancel={() => setEditingScreen(null)}
      />
    );
  }

  return (
    <div>
      <div className={adminStyles.rowBetween}>
        <h2 className={adminStyles.heading}>Announcements</h2>
        <button className={adminStyles.btnPrimary} onClick={() => setEditingScreen({})}>+ Add Screen</button>
      </div>

      <div className={s.grid}>
        {screens.map(sc => (
          <div key={sc.id} className={tStyles.card}>
            <Thumbnail screenId={sc.id} />
            <div className={tStyles.cardBody}>
              <div className={tStyles.cardName}>{sc.name}</div>
              <div className={tStyles.cardMeta}>
                {sc.announcement_data?.elements?.length || 0} element{sc.announcement_data?.elements?.length !== 1 ? 's' : ''}
                {sc.bg_filename && ` · ${sc.bg_label || 'background'} @ ${sc.bg_opacity ?? 100}%`}
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
          <p className={adminStyles.muted}>No announcement screens yet.</p>
        )}
      </div>
    </div>
  );
}
