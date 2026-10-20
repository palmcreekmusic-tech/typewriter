// The "perfect" layout: where every character lands on a monospace grid,
// exactly as a careful typist on a real machine would place it.
// The flaw layer later nudges glyphs off these positions; this module never does.

import type { LayoutSettings, Mode } from './types';
import { typingScript, type Strikeout } from './timeline';

export const LINES_PER_INCH = 6;

export const PAPER_SIZES = {
  letter: { w: 8.5, h: 11 },
  a4: { w: 8.27, h: 11.69 },
} as const;

/** Caption strips get this much paper around the text, in inches. */
export const CAPTION_PAD = { x: 0.45, y: 0.32 };

export interface Cell {
  ch: string;
  /** index of this character in the source text, -1 for a marked-out word that isn't in it */
  index: number;
  /** a mark typed over this character (the x of an x-out) */
  over?: string;
  page: number;
  row: number;
  col: number;
}

export interface Pos {
  page: number;
  row: number;
  col: number;
}

export interface Page {
  /** paper size in inches */
  width: number;
  height: number;
}

export interface Layout {
  mode: Mode;
  /** inches per column and per row */
  cellW: number;
  cellH: number;
  /** where column 0 / row 0 sit on the paper, in inches */
  originX: number;
  originY: number;
  cells: Cell[];
  pages: Page[];
  /** caret position before source index i, for i = 0..text.length */
  caret: Pos[];
  /** column at which the margin bell rings */
  bellCol: number;
  leftCol: number;
  rightCol: number;
  rowsPerPage: number;
}

const isSpace = (c: string) => c === ' ';

/**
 * Lays out the text as typed. Marked-out words take up room on the page, so
 * the layout runs over the typed sequence, then maps cells and caret back to
 * the clean text.
 */
export function layoutText(text: string, mode: Mode, s: LayoutSettings, outs: Strikeout[] = []): Layout {
  if (!outs.length) return layoutClean(text, mode, s);
  const t = typingScript(text, outs);
  const l = layoutClean(t.text, mode, s);
  return {
    ...l,
    cells: l.cells.map((c) => ({ ...c, index: t.src[c.index], over: t.over[c.index] })),
    caret: t.pos.map((p) => l.caret[p]),
  };
}

function layoutClean(text: string, mode: Mode, s: LayoutSettings): Layout {
  const cellW = 1 / s.pitch;
  const cellH = s.lineSpacing / LINES_PER_INCH;

  if (mode === 'caption') return layoutCaption(text, s, cellW, cellH);

  const paper = PAPER_SIZES[s.paperSize];
  const leftCol = Math.round(s.marginLeft * s.pitch);
  const rightCol = Math.max(leftCol + 10, Math.floor((paper.w - s.marginRight) * s.pitch));
  const rowsPerPage = Math.max(1, Math.floor(((paper.h - s.marginTop - s.marginBottom) * LINES_PER_INCH) / s.lineSpacing));

  const flow = flowText(text, leftCol, rightCol, s.tabSize);
  const pages: Page[] = [];
  const toPage = (p: { row: number; col: number }): Pos => ({
    page: Math.floor(p.row / rowsPerPage),
    row: p.row % rowsPerPage,
    col: p.col,
  });
  const cells = flow.cells.map((c) => ({ ...c, ...toPage(c) }));
  const caret = flow.caret.map(toPage);
  const pageCount = Math.max(1, ...caret.map((p) => p.page + 1));
  for (let i = 0; i < pageCount; i++) pages.push({ width: paper.w, height: paper.h });

  return {
    mode: 'letter',
    cellW,
    cellH,
    originX: 0,
    originY: s.marginTop,
    cells,
    pages,
    caret,
    bellCol: rightCol - 7,
    leftCol,
    rightCol,
    rowsPerPage,
  };
}

function layoutCaption(text: string, s: LayoutSettings, cellW: number, cellH: number): Layout {
  const width = Math.max(4, Math.round(s.captionWidth));
  const flow = flowText(text, 0, width, s.tabSize);
  const rows = Math.max(1, ...flow.caret.map((p) => p.row + 1));
  const usedCols = Math.max(8, ...flow.cells.map((c) => c.col + 1), ...flow.caret.map((p) => p.col));
  const page: Page = {
    width: usedCols * cellW + CAPTION_PAD.x * 2,
    height: rows * cellH + CAPTION_PAD.y * 2,
  };
  return {
    mode: 'caption',
    cellW,
    cellH,
    originX: CAPTION_PAD.x,
    originY: CAPTION_PAD.y,
    cells: flow.cells.map((c) => ({ ...c, page: 0 })),
    pages: [page],
    caret: flow.caret.map((p) => ({ ...p, page: 0 })),
    bellCol: width - 7,
    leftCol: 0,
    rightCol: width,
    rowsPerPage: Infinity,
  };
}

/**
 * Word-wraps text between two columns the way a typist would: at the bell
 * they finish the word if it fits, otherwise return the carriage first.
 * A word longer than a whole line is broken where it hits the margin.
 */
function flowText(text: string, leftCol: number, rightCol: number, tabSize: number) {
  const cells: { ch: string; index: number; row: number; col: number }[] = [];
  const caret: { row: number; col: number }[] = new Array(text.length + 1);
  let row = 0;
  let col = leftCol;

  const newline = () => {
    row++;
    col = leftCol;
  };

  let i = 0;
  while (i < text.length) {
    const ch = text[i];
    if (ch === '\r') {
      caret[i] = { row, col };
      i++;
      continue;
    }
    if (ch === '\n') {
      caret[i] = { row, col };
      newline();
      i++;
      continue;
    }
    if (ch === '\t') {
      caret[i] = { row, col };
      const next = leftCol + (Math.floor((col - leftCol) / tabSize) + 1) * tabSize;
      if (next >= rightCol) newline();
      else col = next;
      i++;
      continue;
    }
    if (isSpace(ch)) {
      caret[i] = { row, col };
      // A space that would run past the margin becomes the line break.
      if (col >= rightCol) newline();
      else col++;
      i++;
      continue;
    }
    // A word: measure it, wrap first if it doesn't fit but would on a fresh line.
    let j = i;
    while (j < text.length && !/[\s]/.test(text[j])) j++;
    const len = j - i;
    if (col + len > rightCol && col > leftCol && len <= rightCol - leftCol) newline();
    for (let k = i; k < j; k++) {
      if (col >= rightCol) newline();
      caret[k] = { row, col };
      cells.push({ ch: text[k], index: k, row, col });
      col++;
    }
    i = j;
  }
  caret[text.length] = { row, col: Math.min(col, rightCol) };
  return { cells, caret };
}

/** Paper-space position (inches) of a grid position's baseline-left corner. */
export function cellOrigin(layout: Layout, row: number, col: number) {
  return { x: layout.originX + col * layout.cellW, y: layout.originY + row * layout.cellH };
}
