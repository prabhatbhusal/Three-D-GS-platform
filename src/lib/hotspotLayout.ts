/**
 * Where a hotspot's label card sits on screen (the callout look: a ring on
 * the spot, a thin leader line, a card off to one side). Pure maths, no DOM,
 * so it is tested directly — see test/hotspotLayout.test.mjs.
 */

export const CARD_W = 236;
export const CARD_H = 74;
/** How far the card rises above (or drops below) its marker. */
const LIFT = 64;
/** Horizontal gap between the marker and the card's near edge. */
const SIDE = 26;
const EDGE = 12;
/** Kept clear for the top chrome and the bottom bar. */
const TOP_CLEAR = 76;
const BOTTOM_CLEAR = 150;

export interface CardBox {
  left: number;
  top: number;
  /** Where the leader line meets the card. */
  lineX: number;
  lineY: number;
  below: boolean;
  toLeft: boolean;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(v, hi));

/**
 * The card leans toward the middle of the screen (a marker on the right gets
 * its card to its left), so cards sit over the room instead of off its edge.
 * It rises above the marker unless that would hit the top chrome, then it
 * drops below. Always clamped fully inside a `w` × `h` viewport.
 */
export function cardBox(x: number, y: number, w: number, h: number): CardBox {
  const toLeft = x > w / 2;
  const below = y - LIFT - CARD_H < TOP_CLEAR;
  const left = clamp(toLeft ? x - SIDE - CARD_W : x + SIDE, EDGE, w - EDGE - CARD_W);
  const top = clamp(below ? y + LIFT : y - LIFT - CARD_H, TOP_CLEAR, h - BOTTOM_CLEAR - CARD_H);
  return {
    left,
    top,
    lineX: toLeft ? left + CARD_W : left,
    lineY: below ? top : top + CARD_H,
    below,
    toLeft
  };
}

/** The ids that get a card: the `n` nearest, so a busy room stays readable.
 *  The rest show just their ring until hovered. */
export function nearestIds<T extends { id: string; dist: number }>(list: T[], n: number): Set<string> {
  return new Set([...list].sort((a, b) => a.dist - b.dist).slice(0, n).map((m) => m.id));
}
