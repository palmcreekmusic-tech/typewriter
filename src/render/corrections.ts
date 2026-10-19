// The correction layer: whiteout dabs, correction-paper powder, cover-up
// tape and lift-off dents, drawn over the ink with normal blending so they
// can be whiter than the paper. The retyped letter goes on a layer above.

import type { CorrectionSettings } from '../engine/corrections';
import type { Strike } from '../engine/strikes';
import { gauss, rngFor, type Rng } from '../engine/rng';
import { makeCanvas, ctx2d, type AnyCanvas, type Ctx2D } from './canvas';
import { speckleTile } from './noise';

let patch: AnyCanvas | null = null;
let shadow: AnyCanvas | null = null;
function scratch(which: 'patch' | 'shadow', w: number, h: number): AnyCanvas {
  let c = which === 'patch' ? patch : shadow;
  if (!c || c.width < w || c.height < h) {
    c = makeCanvas(Math.max(w, c?.width ?? 0), Math.max(h, c?.height ?? 0));
    if (which === 'patch') patch = c;
    else shadow = c;
  }
  return c;
}

const tiles = new Map<string, AnyCanvas>();
function tile(key: string, density: number, blur: number): AnyCanvas {
  let t = tiles.get(key);
  if (!t) tiles.set(key, (t = speckleTile(128, rngFor(7, key), density, blur)));
  return t;
}

const mix = (a: number[], b: number[], t: number) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/** Titanium white, never quite the paper's white; it yellows with age. */
function whiteFor(c: CorrectionSettings, style: CorrectionSettings['style']): number[] {
  const fresh = style === 'correction-paper' ? [246, 245, 240] : [251, 250, 246];
  return mix(fresh, [242, 230, 168], c.age * 0.85);
}

export interface GlyphPose {
  ch: string;
  fontCss: string;
  /** glyph baseline center, px */
  x: number;
  y: number;
  rot: number;
  sizePx: number;
}

function glyphShape(ctx: Ctx2D, g: GlyphPose, ox: number, oy: number, grow: number) {
  ctx.save();
  ctx.font = g.fontCss;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.lineJoin = 'round';
  ctx.translate(ox, oy);
  if (g.rot) ctx.rotate(g.rot);
  ctx.fillText(g.ch, 0, 0);
  if (grow > 0) {
    ctx.lineWidth = grow;
    ctx.strokeText(g.ch, 0, 0);
  }
  ctx.restore();
}

/**
 * Paints one correction over the wrong letter onto the white layer.
 * `cellW` is the character cell width in px. Returns how far the patch
 * reaches left and right of the letter's center, in px, so letters it
 * spilled onto can be typed again too (as a typist would).
 */
export function drawPatch(ctx: Ctx2D, c: CorrectionSettings, wrong: GlyphPose, cellW: number, ppi: number, r: Rng): { left: number; right: number } {
  let reach = { left: 0, right: 0 };
  // typed straight over: nothing covers the wrong letter
  if (c.style === 'strikeover') return reach;
  const size = wrong.sizePx;
  const w = Math.ceil(cellW * (3 + c.mess * 3) + size);
  const h = Math.ceil(size * (2.2 + c.mess));
  const pc = scratch('patch', w, h);
  const px = ctx2d(pc);
  px.save();
  px.setTransform(1, 0, 0, 1, 0, 0);
  px.globalCompositeOperation = 'source-over';
  px.globalAlpha = 1;
  px.clearRect(0, 0, w + 2, h + 2);
  // patch-local origin: the wrong glyph's baseline center
  const ox = w / 2;
  const oy = h / 2 + size * 0.35;
  const col = whiteFor(c, c.style);
  const rgb = (a: number) => `rgba(${col[0]},${col[1]},${col[2]},${a})`;
  const thick = 1 - c.showThrough * 0.4;

  if (c.style === 'whiteout') {
    // A few overlapping brush dabs, bigger and looser as it gets messier.
    const dabs = 2 + Math.floor(r() * 2 + c.mess * 2);
    const angle = (r() - 0.5) * 0.5;
    const cy = oy - size * 0.33;
    const shapes: { x: number; y: number; rx: number; ry: number; a: number }[] = [];
    for (let i = 0; i < dabs; i++) {
      shapes.push({
        x: ox + gauss(r) * cellW * (0.06 + 0.3 * c.mess),
        y: cy + gauss(r) * size * (0.04 + 0.1 * c.mess),
        rx: cellW * (0.5 + 0.15 * r() + 0.75 * c.mess * r()),
        ry: size * (0.42 + 0.12 * r() + 0.25 * c.mess * r()),
        a: angle + (r() - 0.5) * 0.35,
      });
    }
    for (const s of shapes) {
      reach = { left: Math.max(reach.left, ox - (s.x - s.rx)), right: Math.max(reach.right, s.x + s.rx - ox) };
    }
    for (const s of shapes) {
      px.save();
      px.translate(s.x, s.y);
      px.rotate(s.a);
      px.scale(s.rx, s.ry);
      // paint has an edge: dense almost to the rim, thinner where the brush lifted
      const g = px.createRadialGradient(0, 0, 0, 0, 0, 1);
      const t = thick * (0.88 + 0.12 * r());
      g.addColorStop(0, rgb(t));
      g.addColorStop(0.7, rgb(t * (0.9 + 0.1 * r())));
      g.addColorStop(0.92, rgb(t * 0.85));
      g.addColorStop(1, rgb(0));
      px.fillStyle = g;
      // a lumpy outline rather than a perfect ellipse
      px.beginPath();
      const steps = 18;
      const ph = r() * 6;
      for (let k = 0; k <= steps; k++) {
        const th = (k / steps) * Math.PI * 2;
        const rr = 1 + 0.06 * Math.sin(th * 3 + ph) + 0.04 * Math.sin(th * 5 + ph * 2) + 0.03 * (r() - 0.5);
        if (k === 0) px.moveTo(Math.cos(th) * rr, Math.sin(th) * rr);
        else px.lineTo(Math.cos(th) * rr, Math.sin(th) * rr);
      }
      px.closePath();
      px.fill();
      px.restore();
    }
    px.globalCompositeOperation = 'source-atop';
    // brush ridges along the stroke
    px.save();
    px.translate(ox, cy);
    px.rotate(angle);
    const lines = 10 + Math.floor(r() * 8);
    for (let i = 0; i < lines; i++) {
      const y = (r() - 0.5) * size * 1.4;
      px.strokeStyle = r() < 0.55 ? 'rgba(255,255,255,0.35)' : 'rgba(90,80,60,0.07)';
      px.lineWidth = Math.max(0.5, ppi * (0.0015 + 0.002 * r()));
      px.beginPath();
      px.moveTo(-w / 2, y);
      px.bezierCurveTo(-w / 6, y + (r() - 0.5) * 3, w / 6, y + (r() - 0.5) * 3, w / 2, y + (r() - 0.5) * 2);
      px.stroke();
    }
    px.restore();
    // a faint darker rim where the fluid pooled as it dried
    for (const s of shapes) {
      px.save();
      px.translate(s.x, s.y);
      px.rotate(s.a);
      px.scale(s.rx * 0.84, s.ry * 0.84);
      px.strokeStyle = `rgba(120,108,85,${0.05 + 0.06 * r()})`;
      px.lineWidth = Math.max(0.6, ppi * 0.003) / Math.min(s.rx, s.ry) * 0.84;
      px.beginPath();
      px.arc(0, 0, 1, r() * 6, r() * 6 + 3 + r() * 3);
      px.stroke();
      px.restore();
    }
    // old fluid crazes into fine cracks
    if (c.age > 0.25) {
      const cracks = Math.floor(c.age * 7);
      px.strokeStyle = `rgba(110,95,70,${0.1 + 0.15 * c.age})`;
      px.lineWidth = Math.max(0.5, ppi * 0.0012);
      for (let k = 0; k < cracks; k++) {
        let x = ox + (r() - 0.5) * cellW * 1.6;
        let y = cy + (r() - 0.5) * size * 0.8;
        px.beginPath();
        px.moveTo(x, y);
        for (let j = 0; j < 4; j++) {
          x += (r() - 0.5) * size * 0.35;
          y += (r() - 0.5) * size * 0.25;
          px.lineTo(x, y);
        }
        px.stroke();
      }
    }
    // breaks up the edge so it reads as paint, not a gradient
    px.globalCompositeOperation = 'destination-out';
    const pat = px.createPattern(tile('whiteout-edge', 0.25, 0.4) as CanvasImageSource, 'repeat');
    if (pat) {
      px.globalAlpha = 0.12;
      px.fillStyle = pat;
      px.fillRect(0, 0, w, h);
    }
  } else if (c.style === 'correction-paper' || c.style === 'tape') {
    // White powder or tape struck through the wrong letter: its own shape, a bit fatter.
    const paper = c.style === 'correction-paper';
    px.fillStyle = rgb(1);
    px.strokeStyle = rgb(1);
    px.globalAlpha = paper ? 0.92 - 0.45 * c.showThrough : 0.98 - 0.25 * c.showThrough;
    glyphShape(px, wrong, ox, oy, ppi * (paper ? 0.006 : 0.011) * (1 + c.mess));
    if (paper) {
      // chalky: the powder never lands evenly
      px.globalAlpha = 1;
      px.globalCompositeOperation = 'destination-out';
      const pat = px.createPattern(tile('chalk', 0.35, 0.3) as CanvasImageSource, 'repeat');
      if (pat) {
        px.globalAlpha = 0.45;
        px.fillStyle = pat;
        px.fillRect(0, 0, w, h);
      }
    }
  } else {
    // Lift-off: the ink is gone, only the dent of the type slug is left.
    px.fillStyle = 'rgba(255,255,255,0.5)';
    glyphShape(px, wrong, ox - 0.5, oy - 0.5, 0);
    px.globalCompositeOperation = 'destination-out';
    px.fillStyle = 'rgba(0,0,0,1)';
    glyphShape(px, wrong, ox + 0.4, oy + 0.4, 0);
  }
  px.restore();

  const dx = wrong.x - ox;
  const dy = wrong.y - oy;
  if (c.style !== 'liftoff') {
    // The dried patch is a little raised: a soft shadow on one side.
    const sc = scratch('shadow', w, h);
    const sx = ctx2d(sc);
    sx.save();
    sx.setTransform(1, 0, 0, 1, 0, 0);
    sx.globalCompositeOperation = 'source-over';
    sx.clearRect(0, 0, w + 2, h + 2);
    sx.drawImage(pc as CanvasImageSource, 0, 0, w, h, 0, 0, w, h);
    sx.globalCompositeOperation = 'source-in';
    sx.fillStyle = 'rgb(70,55,35)';
    sx.fillRect(0, 0, w, h);
    sx.restore();
    const lift = Math.max(0.6, ppi * (c.style === 'whiteout' ? 0.004 : 0.002));
    ctx.save();
    ctx.globalAlpha = c.style === 'whiteout' ? 0.16 : 0.08;
    ctx.drawImage(sc as CanvasImageSource, 0, 0, w, h, dx + lift * 0.7, dy + lift, w, h);
    ctx.restore();
  }
  ctx.drawImage(pc as CanvasImageSource, 0, 0, w, h, dx, dy, w, h);
  return reach;
}

/**
 * The right letter, typed again on top of the correction: ink sits on the
 * surface, so it's darker and crisper, and the paper never went back to
 * exactly the same spot.
 */
export function retypeStrike(s: Strike, c: CorrectionSettings, r: Rng): Strike {
  const lift = c.style === 'liftoff';
  // typing over in place means the paper never moved, so it lands close
  const over = c.style === 'strikeover';
  if (over) return { ...s, dx: s.dx + gauss(r) * 0.002, dy: s.dy + gauss(r) * 0.002, double: undefined, trail: undefined, blots: [] };
  const slipIn = lift ? 0 : 0.4 + c.mess;
  return {
    ...s,
    dx: s.dx + gauss(r) * 0.006 * slipIn,
    dy: s.dy + gauss(r) * 0.005 * slipIn + (r() - 0.4) * 0.004 * slipIn,
    rot: s.rot + gauss(r) * 0.01 * slipIn,
    alpha: Math.min(1, s.alpha * (lift ? 1 : 1.06) + 0.03),
    spread: s.spread * 0.7,
    top: 1,
    bottom: 1,
    fill: 0,
    double: undefined,
    trail: undefined,
    cutBottom: undefined,
    left: 1,
    right: 1,
    blots: [],
  };
}

/** Typed before it dried: the slug drags grey ink into the wet white. */
export function drawSmudge(ctx: Ctx2D, x: number, y: number, sizePx: number, rush: number, inkColor: string, r: Rng) {
  if (rush < 0.05) return;
  const cx = x + (r() - 0.5) * sizePx * 0.2;
  const cy = y - sizePx * 0.32;
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((r() - 0.5) * 0.8);
  ctx.scale(1.2 + rush, 0.7);
  const rad = sizePx * (0.45 + 0.3 * rush);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
  g.addColorStop(0, inkColor);
  g.addColorStop(1, 'transparent');
  ctx.globalAlpha = 0.1 + 0.25 * rush;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, 0, rad, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/** Where the patch is bumpy, the retyped letter skips: knock bits out of it. */
export function breakOnBumps(ctx: Ctx2D, w: number, h: number, mess: number, ox: number, oy: number) {
  const pat = ctx.createPattern(tile('bumps', 0.08 + 0.12 * mess, 0.5) as CanvasImageSource, 'repeat');
  if (!pat) return;
  pat.setTransform?.(new DOMMatrix().translate(-ox, -oy));
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'destination-out';
  ctx.globalAlpha = 0.5;
  ctx.fillStyle = pat;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}
