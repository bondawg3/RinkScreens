import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ICONS } from '../../icons';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { SortableContext, rectSortingStrategy } from '@dnd-kit/sortable';
import { useApi, apiFetch } from '../../hooks/useApi';
import adminStyles from './AdminTab.module.css';
import tStyles from './ScreensTab.module.css';
import s from './AnnouncementTab.module.css';
import Thumbnail from './Thumbnail';
import { useScreenCards, useScreenReorder, InUseBadge, EyeButton, EyeHint, DuplicateButton, SortableCard, DragHandle } from './screenCard';
import { FONTS, makeId, hexToRgba, AutoFitText, StackedBoxText, LinesEditor, Section, useUndo, useArrowKeyNudge, ResizeHandles, borderStyle, BORDER_SIDES, reorderElement, LayersPanel, SteppedSlider, SteppedNumberInput } from './SlideEditorShared';

function formatDateTimePreview(format, showSeconds) {
  const now = new Date();
  const time = now.toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', ...(showSeconds ? { second: '2-digit' } : {}),
  });
  const date = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  if (format === 'time') return time;
  if (format === 'date') return date;
  return date + '\n' + time;
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
  const [bgColorAlpha, setBgColorAlpha] = useState(screen.bg_color_alpha ?? 100);
  const [headerLineWidth, setHeaderLineWidth] = useState(screen.header_line_width ?? 0);
  const [headerLineColor, setHeaderLineColor] = useState(screen.header_line_color || '#000000');
  const [selectedId, setSelectedId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  const canvasRef = useRef(null);
  const canvasOuterRef = useRef(null);
  const canvasFitRef = useRef(null);
  const dragRef = useRef(null);

  // Undo/redo (Ctrl+Z / Cmd+Z, Shift to redo) over the elements array
  const pushHistory = useUndo(useCallback(() => elements, [elements]), setElements);

  useArrowKeyNudge({ selectedId, elements, updateEl });

  // Canvas is sized to the largest 16:9 box that fits inside canvasFit (the
  // flexible area below the header/toolbar rows), so it shrinks to stay
  // fully visible instead of overflowing when other rows above it grow.
  const [canvasWidth, setCanvasWidth] = useState(800);
  const [canvasHeight, setCanvasHeight] = useState(450);
  useEffect(() => {
    if (!canvasFitRef.current) return;
    function measure() {
      const el = canvasFitRef.current;
      if (!el) return;
      const availW = el.clientWidth;
      const availH = el.clientHeight;
      let w = availW, h = w * 9 / 16;
      if (h > availH) { h = availH; w = h * 16 / 9; }
      setCanvasWidth(Math.round(w));
      setCanvasHeight(Math.round(h));
    }
    measure();
    const obs = new ResizeObserver(measure);
    obs.observe(canvasFitRef.current);
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
    pushHistory();
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
    pushHistory();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function addImage(filename) {
    if (!filename) return;
    const el = { id: makeId(), type: 'image', filename, width: 25, x: 50, y: 50, borderWidth: 0, borderColor: '#ffffff' };
    pushHistory();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function addDateTime() {
    const el = {
      id: makeId(), type: 'datetime', format: 'datetime', showSeconds: false,
      color: '#ffffff', font: 'DS-Digital', size: 48, bold: false, align: 'center',
      x: 50, y: 50,
    };
    pushHistory();
    setElements(prev => [...prev, el]);
    setSelectedId(el.id);
  }

  function deleteEl(id) {
    pushHistory();
    setElements(prev => prev.filter(el => el.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  function moveLayer(id, dir) {
    pushHistory();
    setElements(prev => reorderElement(prev, id, dir));
  }

  function layerLabel(el) {
    if (el.type === 'text') return (el.text || '').trim() || 'Text';
    if (el.type === 'datetime') return 'Date/Time';
    return 'Image';
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
      bg_color_alpha: bgColorAlpha,
      header_line_width: headerLineWidth,
      header_line_color: headerLineColor,
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
        <span style={{ color: 'rgba(255,255,255,0.35)', fontSize: '0.78rem' }}>Ctrl+Z to undo</span>
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
          <div className={s.canvasFit} ref={canvasFitRef}>
          <div className={s.canvasOuter} ref={canvasOuterRef} style={{ width: canvasWidth + 'px', height: canvasHeight + 'px', backgroundColor: bgColor ? hexToRgba(bgColor, bgColorAlpha) : '#0a2a42' }}>
            <div
              className={s.canvas}
              ref={canvasRef}
              onClick={e => { if (e.target === canvasRef.current) setSelectedId(null); }}
            >
              {/* Background image (opacity independent of the color's own transparency) */}
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
                  className={s.canvasEl}
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
                        whiteSpace: 'pre',
                        display: 'block',
                        lineHeight: 1.2,
                        pointerEvents: 'none',
                      }}>{el.text || ' '}</span>
                    )
                  ) : el.type === 'datetime' ? (
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
                    }}>{formatDateTimePreview(el.format, el.showSeconds)}</span>
                  ) : (
                    <img
                      src={`/uploads/${el.filename}`}
                      style={{
                        width: Math.round(el.width / 100 * canvasWidth) + 'px',
                        display: 'block',
                        boxSizing: 'border-box',
                        ...borderStyle(el, scale),
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

        </div>

        {/* Properties panel */}
        <div className={s.propsPanel}>
          {/* Selected element properties */}
          {selectedEl && (
            <Section
              title={selectedEl.type === 'text' ? 'Text' : selectedEl.type === 'datetime' ? 'Date/Time' : 'Image'}
              extra={<button className={s.deleteBtnDark} onClick={() => deleteEl(selectedId)}>Remove</button>}
              highlighted
            >
              {selectedEl.type === 'text' && (
                <>
                  {!(selectedEl.boxWidth && selectedEl.boxHeight && selectedEl.lines && selectedEl.lines.length) && (
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
                        <div className={s.propLabel}>Size — {selectedEl.size}px{selectedEl.boxWidth && selectedEl.boxHeight ? ' (max)' : ''}</div>
                        <div className={s.propRow}>
                          <SteppedSlider min={12} max={200} value={selectedEl.size} onChange={v => updateEl(selectedId, { size: v })} />
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
                          Size above is a max — it shrinks (and wraps, if the box is tall enough) to fit.
                          Drag the yellow handles on the canvas to resize.
                        </div>
                        <div className={s.propLabel}>Box Width — {selectedEl.boxWidth}%</div>
                        <div className={s.propRow}>
                          <SteppedSlider min={5} max={100} value={selectedEl.boxWidth} onChange={v => updateEl(selectedId, { boxWidth: v })} />
                        </div>
                        <div className={s.propLabel}>Box Height — {selectedEl.boxHeight}%</div>
                        <div className={s.propRow}>
                          <SteppedSlider min={5} max={100} value={selectedEl.boxHeight} onChange={v => updateEl(selectedId, { boxHeight: v })} />
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
                          <SteppedSlider min={0} max={100} value={selectedEl.boxPadding || 0} onChange={v => updateEl(selectedId, { boxPadding: v })} />
                        </div>
                        <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>Corner Radius — {selectedEl.boxRadius || 0}px</div>
                        <div className={s.propRow}>
                          <SteppedSlider min={0} max={100} value={selectedEl.boxRadius || 0} onChange={v => updateEl(selectedId, { boxRadius: v })} />
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
                            <button className={s.deleteBtnDark} onClick={() => updateEl(selectedId, { boxColor: undefined })} title="Clear">{ICONS.close}</button>
                          )}
                        </div>
                        <div className={s.propLabel} style={{ marginTop: '0.3rem' }}>Box Color Opacity — {selectedEl.boxAlpha ?? 100}%</div>
                        <div className={s.propRow}>
                          <SteppedSlider min={0} max={100} value={selectedEl.boxAlpha ?? 100} onChange={v => updateEl(selectedId, { boxAlpha: v })} />
                        </div>

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
                              Each line has its own font/size/color/alignment. The whole stack shrinks together to fit the box.
                            </div>
                            <div className={s.propLabel}>Line Spacing — {selectedEl.lineSpacing || 0}px</div>
                            <div className={s.propRow} style={{ marginBottom: '0.3rem' }}>
                              <SteppedSlider min={0} max={60} value={selectedEl.lineSpacing || 0} onChange={v => updateEl(selectedId, { lineSpacing: v })} />
                            </div>
                            <LinesEditor lines={selectedEl.lines} onChange={next => updateEl(selectedId, { lines: next })} />
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </>
              )}

              {selectedEl.type === 'datetime' && (
                <>
                  <div>
                    <div className={s.propLabel}>Format</div>
                    <select
                      className={s.propSelect}
                      value={selectedEl.format}
                      onChange={e => updateEl(selectedId, { format: e.target.value })}
                    >
                      <option value="datetime">Date &amp; Time</option>
                      <option value="date">Date only</option>
                      <option value="time">Time only</option>
                    </select>
                  </div>

                  {selectedEl.format !== 'date' && (
                    <div>
                      <label className={s.checkRow}>
                        <input
                          type="checkbox"
                          checked={!!selectedEl.showSeconds}
                          onChange={e => updateEl(selectedId, { showSeconds: e.target.checked })}
                        />
                        Show seconds
                      </label>
                    </div>
                  )}

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
                      <SteppedSlider min={12} max={200} value={selectedEl.size} onChange={v => updateEl(selectedId, { size: v })} />
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
                      <SteppedSlider min={5} max={100} value={selectedEl.width} onChange={v => updateEl(selectedId, { width: v })} />
                    </div>
                  </div>
                  <div>
                    <div className={s.propLabel}>Border Width — {selectedEl.borderWidth || 0}px</div>
                    <div className={s.propRow}>
                      <SteppedSlider min={0} max={20} value={selectedEl.borderWidth || 0} onChange={v => updateEl(selectedId, { borderWidth: v })} />
                    </div>
                  </div>
                  {!!selectedEl.borderWidth && (
                    <>
                      <div>
                        <div className={s.propLabel}>Border Color</div>
                        <input
                          type="color"
                          className={s.colorInput}
                          value={selectedEl.borderColor || '#ffffff'}
                          onChange={e => updateEl(selectedId, { borderColor: e.target.value })}
                        />
                      </div>
                      <div>
                        <div className={s.propLabel}>Border Side</div>
                        <div className={s.alignToggle} style={{ width: '100%', flexWrap: 'wrap' }}>
                          {BORDER_SIDES.map(({ value, label }) => (
                            <button
                              key={value}
                              type="button"
                              className={(selectedEl.borderSide || 'all') === value ? s.alignActive : s.alignBtn}
                              onClick={() => updateEl(selectedId, { borderSide: value })}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              {/* Position */}
              <div>
                <div className={s.propLabel}>Position (X / Y %)</div>
                <div className={s.propRow}>
                  <SteppedNumberInput min={0} max={100} value={selectedEl.x} onChange={v => updateEl(selectedId, { x: v })} />
                  <SteppedNumberInput min={0} max={100} value={selectedEl.y} onChange={v => updateEl(selectedId, { y: v })} />
                </div>
              </div>
            </Section>
          )}
          {!selectedEl && (
            <div style={{ padding: '0.6rem 0.2rem', color: 'rgba(255,255,255,0.35)', fontSize: '0.82rem' }}>
              Click an element on the canvas to edit its properties, or add a new one below.
            </div>
          )}

          <Section title="Layers">
            <div className={s.propLabel} style={{ marginBottom: '0.1rem' }}>Top of the list renders in front.</div>
            <LayersPanel
              elements={elements}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onReorder={moveLayer}
              labelFor={layerLabel}
            />
          </Section>

          {/* Add elements */}
          <Section title="Add Element">
            <div className={s.addBtns}>
              <button className={s.addBtn} onClick={() => addText('heading')}>+ Heading</button>
              <button className={s.addBtn} onClick={() => addText('body')}>+ Body</button>
              <button className={s.addBtn} onClick={() => addText('footer')}>+ Footer</button>
              <button className={s.addBtn} onClick={addDateTime}>+ Date/Time</button>
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
          </Section>

          {/* Background */}
          <Section title="Background" defaultOpen={false}>
            <div className={s.propLabel}>Color</div>
            <div className={s.propRow}>
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
                onChange={e => setBgColor(e.target.value)}
                style={{ fontFamily: 'monospace', flex: 1 }}
              />
              {bgColor && (
                <button className={s.deleteBtnDark} onClick={() => setBgColor('')} title="Clear color">{ICONS.close}</button>
              )}
            </div>
            <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Color Transparency — {bgColorAlpha}%</div>
            <div className={s.propRow}>
              <SteppedSlider min={0} max={100} value={bgColorAlpha} onChange={setBgColorAlpha} />
            </div>

            <select
              className={s.propSelect}
              value={backgroundId}
              onChange={e => setBackgroundId(e.target.value)}
              style={{ marginTop: '0.4rem' }}
            >
              <option value="">None</option>
              {bgImages.map(b => (
                <option key={b.id} value={b.id}>{b.label}</option>
              ))}
            </select>
            {backgroundId && (
              <>
                <div className={s.propLabel} style={{ marginTop: '0.4rem' }}>Image Opacity — {bgOpacity}%</div>
                <div className={s.propRow}>
                  <SteppedSlider min={0} max={100} value={bgOpacity} onChange={setBgOpacity} />
                </div>
              </>
            )}
          </Section>

          <Section title="Header Divider" defaultOpen={false}>
            <div className={s.propLabel} style={{ marginBottom: '0.2rem' }}>
              An optional line under the rink name/clock header, above this screen's content. Width 0 hides it.
            </div>
            <div className={s.propLabel}>Width — {headerLineWidth}px</div>
            <div className={s.propRow}>
              <SteppedSlider min={0} max={20} value={headerLineWidth} onChange={setHeaderLineWidth} />
              {headerLineWidth > 0 && (
                <input
                  type="color"
                  className={s.colorInput}
                  value={headerLineColor}
                  onChange={e => setHeaderLineColor(e.target.value)}
                  title="Line color"
                />
              )}
            </div>
          </Section>

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
  const { orderedScreens, sensors, handleDragEnd } = useScreenReorder({ screens, reload });

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

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={orderedScreens.map(sc => sc.id)} strategy={rectSortingStrategy}>
          <div className={s.grid}>
            {orderedScreens.map(sc => (
          <SortableCard key={sc.id} id={sc.id} className={tStyles.card} draggingClassName={tStyles.dragging}>
            {({ attributes, listeners }) => (
              <>
            <Thumbnail screenId={sc.id} />
            <div className={tStyles.cardBody}>
              <div className={tStyles.cardName}>{sc.name}</div>
              <div className={tStyles.cardMeta}>
                {sc.announcement_data?.elements?.length || 0} element{sc.announcement_data?.elements?.length !== 1 ? 's' : ''}
                {sc.bg_filename && ` · ${sc.bg_label || 'background'} @ ${sc.bg_opacity ?? 100}%`}
              </div>
              <InUseBadge name={assignedDisplayName(sc.id)} />
              <div className={tStyles.cardActions}>
                <DragHandle attributes={attributes} listeners={listeners} className={tStyles.dragHandle} />
                <a href={`/tv/screen/${sc.id}?preview`} target="_blank" rel="noreferrer" className={adminStyles.btnGhost} title="Preview">{ICONS.preview}</a>
                <button className={adminStyles.btnGhost} onClick={() => setEditingScreen(sc)} title="Edit">{ICONS.edit}</button>
                <EyeButton screen={sc} assignedName={assignedDisplayName(sc.id)} onToggle={toggleVisible} />
                <button className={adminStyles.btnDanger} onClick={() => deleteScreen(sc.id)} title="Delete">{ICONS.remove}</button>
                <DuplicateButton screen={sc} onDuplicate={duplicateScreen} />
              </div>
              <EyeHint show={eyeHint === sc.id} name={assignedDisplayName(sc.id)} />
            </div>
              </>
            )}
          </SortableCard>
            ))}
            {screens.length === 0 && (
              <p className={adminStyles.muted}>No announcement screens yet.</p>
            )}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}
