/**
 * SINUCA — AI opponent (pure, unit-tested). Because the physics engine is
 * deterministic, the bot plays by SIMULATING real shots: enumerate ghost-ball
 * candidates (legal target × pocket), keep the geometrically clean ones, run
 * the actual simulation for the best few with level-dependent aim error, and
 * pick the outcome the rules score highest. Fácil sprays; Difícil pots and
 * keeps position. Falls back to a soft safety when no pot is on.
 */
import { TABLE, POCKETS, simulate, placeCueBall } from './engine'
import { legalTargets, evaluateShot } from './rules'

const R = TABLE.R

export const LEVELS = {
  easy: { sigma: 0.03, candidates: 2, power: 0.08 },
  medium: { sigma: 0.011, candidates: 4, power: 0.04 },
  hard: { sigma: 0.0035, candidates: 7, power: 0.015 },
}

// deterministic gaussian-ish noise (central limit of the injected rng)
const noise = (rng, sigma) => (rng() + rng() + rng() + rng() - 2) * sigma * 1.732

const live = (balls) => balls.filter((b) => !b.pocketed)
const cueOf = (balls) => balls.find((b) => b.n === 0 && !b.pocketed)

/** Does the open segment a→b stay clear of every ball except the ignored ids? */
function pathClear(balls, ax, az, bx, bz, ignore) {
  const dx = bx - ax
  const dz = bz - az
  const len = Math.hypot(dx, dz) || 1
  for (const o of live(balls)) {
    if (ignore.includes(o.n)) continue
    const t = Math.max(0, Math.min(1, ((o.x - ax) * dx + (o.z - az) * dz) / (len * len)))
    const px = ax + dx * t
    const pz = az + dz * t
    if (Math.hypot(o.x - px, o.z - pz) < 2 * R - 0.002) return false
  }
  return true
}

/** Geometric pot candidates: ghost-ball point behind each target per pocket. */
export function potCandidates(balls, targets) {
  const cue = cueOf(balls)
  if (!cue) return []
  const out = []
  for (const t of live(balls)) {
    if (!targets.includes(t.n)) continue
    for (const p of POCKETS) {
      const toPocket = { x: p.x - t.x, z: p.z - t.z }
      const dPocket = Math.hypot(toPocket.x, toPocket.z) || 1
      const ghost = {
        x: t.x - (toPocket.x / dPocket) * 2 * R,
        z: t.z - (toPocket.z / dPocket) * 2 * R,
      }
      const toGhost = { x: ghost.x - cue.x, z: ghost.z - cue.z }
      const dGhost = Math.hypot(toGhost.x, toGhost.z)
      if (dGhost < R) continue // cue basically on the ghost point — degenerate
      // cut angle: the cue's travel must push the target toward the pocket
      const cos = (toGhost.x * toPocket.x + toGhost.z * toPocket.z) / (dGhost * dPocket)
      if (cos < 0.12) continue // > ~83° cut — not makeable
      if (!pathClear(balls, cue.x, cue.z, ghost.x, ghost.z, [0, t.n])) continue
      if (!pathClear(balls, t.x, t.z, p.x, p.z, [0, t.n])) continue
      const angle = Math.atan2(toGhost.z, toGhost.x)
      // enough speed for both legs, harder for thin cuts
      const power = Math.min(1, 0.22 + (dGhost + dPocket) * 0.16 + (1 - cos) * 0.3)
      out.push({ angle, power, target: t.n, pocket: p.id, appeal: cos / (1 + dGhost + dPocket) })
    }
  }
  return out.sort((a, b) => b.appeal - a.appeal)
}

/**
 * Bolas de OBJETO encaçapadas: nem a branca (0), nem a oito.
 *
 * É a única parcela positiva da nota de uma tacada, e as duas exclusões são a
 * regra do jogo em uma linha: encaçapar a branca é falta, e a oito só vale na
 * hora certa (quem decide isso é `rules`, não a nota). Exposta porque por
 * dentro da simulação a diferença some no meio de outras seis parcelas.
 */
export const objectBallsPotted = (potted) =>
  (Array.isArray(potted) ? potted : []).filter((n) => n !== 0 && n !== 8).length

/** Score a simulated outcome from the shooter's point of view. */
function scoreOutcome(match, shooter, shot, verdict) {
  if (match.winner === shooter) return 1000
  if (match.winner) return -1000
  let s = 0
  if (verdict.foul) s -= 90
  const pots = objectBallsPotted(verdict.potted)
  s += pots * 60
  if (match.shooter === shooter) s += 35 // we kept the table
  const cue = cueOf(shot.balls)
  if (cue) s += Math.max(0, 8 - (Math.abs(cue.x) / (TABLE.W / 2)) * 8) // centre-ish cue
  return s
}

/**
 * The bot's shot for the current position. Returns { angle, power, spin } —
 * always simulated-legal at hard, humanly wobbly at easy. `rng` injectable.
 */
export function bestShot(balls, match, level = 'medium', rng = Math.random) {
  const cfg = LEVELS[level] || LEVELS.medium
  const targets = legalTargets(match, balls)
  const cue = cueOf(balls)
  if (!cue || targets.length === 0) return { angle: 0, power: 0.4, spin: {} }

  const candidates = potCandidates(balls, targets).slice(0, cfg.candidates)
  let best = null
  for (const c of candidates) {
    const shot = {
      angle: c.angle + noise(rng, cfg.sigma),
      power: Math.min(1, Math.max(0.15, c.power + noise(rng, cfg.power))),
      spin: {},
    }
    const sim = simulate(balls, shot)
    const m = JSON.parse(JSON.stringify(match))
    const verdict = evaluateShot(m, sim)
    const score = scoreOutcome(m, match.shooter, sim, verdict)
    if (!best || score > best.score) best = { ...shot, score }
  }
  if (best && best.score > -50) return { angle: best.angle, power: best.power, spin: best.spin }

  // safety: roll gently into a legal ball — prefer one we can reach on a
  // CLEAR line (guaranteed legal contact); only then fall back to the nearest
  let near = null
  for (const clearOnly of [true, false]) {
    for (const t of live(balls)) {
      if (!targets.includes(t.n)) continue
      if (clearOnly && !pathClear(balls, cue.x, cue.z, t.x, t.z, [0, t.n])) continue
      const d = Math.hypot(t.x - cue.x, t.z - cue.z)
      if (!near || d < near.d) near = { t, d }
    }
    if (near) break
  }
  const ang = Math.atan2(near.t.z - cue.z, near.t.x - cue.x) + noise(rng, cfg.sigma)
  return { angle: ang, power: Math.min(0.5, 0.2 + near.d * 0.12), spin: {} }
}

/** Ball-in-hand: put the cue somewhere with a clean look at a legal ball. */
export function bestPlacement(balls, match) {
  const targets = legalTargets(match, balls)
  // Grade de tentativa escrita por extenso, e não acumulada em ponto flutuante:
  // somar 0.3 sete vezes nunca cai exatamente em 0.9, então o `<=` do laço
  // decidia igual ao `<` e ficava um comparador que nenhuma mesa separava. A
  // lista também diz de relance onde a IA tenta pousar a bola branca.
  const XS = [-0.9, -0.6, -0.3, 0, 0.3, 0.6, 0.9]
  const ZS = [-0.4, -0.2, 0, 0.2, 0.4]
  const spots = []
  for (const x of XS) for (const z of ZS) spots.push({ x, z })
  for (const s of spots) {
    const copy = balls.map((b) => ({ ...b }))
    if (!placeCueBall(copy, s.x, s.z)) continue
    if (potCandidates(copy, targets).length > 0) return s
  }
  return { x: -TABLE.W / 4, z: 0 } // head spot fallback
}
