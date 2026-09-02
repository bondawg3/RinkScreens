/**
 * Single source of truth for the admin UI's icon glyphs.
 *
 * Every icon-only button in the admin renders one of these as its text
 * content, e.g. `<button title="Edit">{ICONS.edit}</button>`. To restyle the
 * iconography app-wide — swap an emoji for another, move to a different glyph
 * set — change it here and nowhere else.
 *
 * `close` covers cancel / clear / dismiss / close-dialog (all the ✕ buttons);
 * they share a glyph today but can be split into separate keys later if they
 * should diverge.
 */
export const ICONS = {
  edit: '✎',        // U+270E — edit / rename
  remove: '🗑',      // U+1F5D1 — delete / remove (paired with .btnDanger)
  preview: '📺',     // open the TV preview
  schedule: '📅',    // open the display scheduler
  duplicate: '⧉',   // U+29C9 — duplicate / copy
  save: '✓',        // U+2713 — confirm an inline edit
  close: '✕',       // U+2715 — cancel / clear / dismiss / close
  expand: '⤢',      // U+2922 — "whole day" in the scheduler
  visible: '👁',     // screen shown in the Displays tab
  hidden: '🚫',      // screen hidden from the Displays tab
  dragHandle: '⠿',  // U+283F — drag-to-reorder grip
  pinned: '📌',      // kept / pinned badge
};
