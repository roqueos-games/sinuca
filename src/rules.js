/**
 * SINUCA — 8-ball rules (pure, unit-tested). Consumes the events + final ball
 * list of a finished shot (from engine.js) and answers: foul? who shoots next?
 * groups assigned? game over? Casual-but-honest ruleset:
 *
 * - Open table after the break; the first LEGAL pot assigns your group
 *   (solids 1-7 / stripes 9-15). Break pots don't assign.
 * - Fouls: scratch (cue pocketed), no contact, or first contact on a ball
 *   that isn't yours (the 8 is nobody's until your group is cleared).
 *   A foul gives the opponent ball in hand.
 * - You keep shooting while you legally pot one of yours.
 * - The 8: pot it after clearing your group → WIN. Pot it early, or pot it
 *   together with a scratch → LOSS. On the break it is re-spotted (no loss).
 */
import { isSolid, isStripe } from './engine'

export const SOLID = 'solid'
export const STRIPE = 'stripe'

export function createMatch() {
  return {
    shooter: 1,
    groups: { 1: null, 2: null }, // null until the table closes
    breakDone: false,
    ballInHand: false,
    winner: 0,
  }
}

const other = (p) => (p === 1 ? 2 : 1)
const inGroup = (n, g) => (g === SOLID ? isSolid(n) : g === STRIPE ? isStripe(n) : false)

/** Live (unpocketed) balls of a group. */
export function remaining(balls, group) {
  return balls.filter((b) => !b.pocketed && inGroup(b.n, group)).length
}

/**
 * The ball numbers `shooter` may legally CONTACT FIRST / aim to pot right now:
 * open table → everything but the 8; assigned → your group; cleared → the 8.
 */
export function legalTargets(match, balls) {
  const g = match.groups[match.shooter]
  const live = balls.filter((b) => !b.pocketed && b.n !== 0)
  if (!g) return live.filter((b) => b.n !== 8).map((b) => b.n)
  if (remaining(balls, g) === 0) return live.filter((b) => b.n === 8).map((b) => b.n)
  return live.filter((b) => inGroup(b.n, g)).map((b) => b.n)
}

/**
 * Judge a finished shot. `shot` is the settled engine state (events, firstHit,
 * balls). Mutates + returns `match`, plus a verdict the UI/AI can read:
 * { foul, reasons[], potted[], respot8, over }.
 */
export function evaluateShot(match, shot) {
  const me = match.shooter
  const wasBreak = !match.breakDone
  match.breakDone = true
  match.ballInHand = false

  const potted = shot.events.filter((e) => e.type === 'pocket').map((e) => e.ball)
  const scratch = potted.includes(0)
  const potted8 = potted.includes(8)
  const objectPots = potted.filter((n) => n !== 0 && n !== 8)

  const g = match.groups[me]
  // remaining() reads the POST-shot board. My group balls can only leave the
  // table, so "cleared now" === remaining === 0; and "was ALREADY on the 8
  // when this shot started" === cleared now AND none of mine fell this shot.
  const groupCleared = g ? remaining(shot.balls, g) === 0 : false
  const wasOnThe8 = groupCleared && !objectPots.some((n) => inGroup(n, g))

  const reasons = []
  const first = shot.firstHit ? (shot.firstHit.a === 0 ? shot.firstHit.b : shot.firstHit.a) : null
  if (first == null) reasons.push('no-contact')
  if (scratch) reasons.push('scratch')
  if (first != null && !wasBreak) {
    if (g) {
      // legal first contact: one of MY balls, or the 8 iff I was on the 8
      const legal = inGroup(first, g) || (first === 8 && wasOnThe8)
      if (!legal) reasons.push('wrong-ball')
    } else if (first === 8) {
      reasons.push('wrong-ball') // open table: the 8 is never a legal first hit
    }
  }
  const foul = reasons.length > 0

  // ── the 8 decides games ────────────────────────────────────────────────────
  let respot8 = false
  if (potted8) {
    if (wasBreak) {
      respot8 = true // casual rule: 8 on the break is re-spotted, game goes on
    } else if (g && groupCleared && !scratch && !foul) {
      match.winner = me // legal 8 → win
    } else {
      match.winner = other(me) // early 8 / 8 with a foul → loss
    }
  }

  if (!match.winner) {
    // group assignment: first legal pot after the break closes the table
    if (!g && !foul && objectPots.length > 0 && !wasBreak) {
      const firstPot = objectPots[0]
      match.groups[me] = isSolid(firstPot) ? SOLID : STRIPE
      match.groups[other(me)] = isSolid(firstPot) ? STRIPE : SOLID
    }
    const mine = match.groups[me]
    const pottedMine = objectPots.some((n) => (mine ? inGroup(n, mine) : true))
    const keepShooting = !foul && pottedMine && objectPots.length > 0
    if (!keepShooting) match.shooter = other(me)
    match.ballInHand = foul
  }

  return { foul, reasons, potted, respot8, over: match.winner !== 0 }
}
