import { describe, it, expect } from 'vitest'
import { TABLE, POCKETS, simulate } from '../src/engine.js'
import { createMatch, SOLID, STRIPE } from '../src/rules.js'
import { bestShot, potCandidates, bestPlacement, objectBallsPotted, LEVELS } from '../src/ai.js'

const seeded = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}
const mk = (n, x, z, pocketed = false) => ({
  n,
  x,
  z,
  vx: 0,
  vz: 0,
  slide: 0,
  follow: 0,
  side: 0,
  pocketed,
})

// a dead-straight look: cue → ball 1 → the (+x,+z) corner pocket, all aligned
const straightPot = () => {
  const p = POCKETS[3]
  return [mk(0, p.x - 0.7, p.z - 0.7), mk(1, p.x - 0.35, p.z - 0.35), mk(9, -0.8, -0.3)]
}
const matchOn = (shooterGroup) => {
  const m = createMatch()
  m.breakDone = true
  m.groups = { 1: shooterGroup, 2: shooterGroup === SOLID ? STRIPE : SOLID }
  return m
}

describe('pool/ai — candidates', () => {
  it('finds the dead-straight pot and ranks it first', () => {
    const cands = potCandidates(straightPot(), [1])
    expect(cands.length).toBeGreaterThan(0)
    expect(cands[0].target).toBe(1)
    expect(cands[0].pocket).toBe(3)
  })

  it('skips candidates whose path is blocked by another ball', () => {
    const balls = straightPot()
    // park a blocker exactly between cue and the ghost point
    balls.push(mk(12, POCKETS[3].x - 0.55, POCKETS[3].z - 0.55))
    const cands = potCandidates(balls, [1])
    expect(cands.some((c) => c.target === 1 && c.pocket === 3)).toBe(false)
  })
})

describe('pool/ai — bestShot plays real, legal shots', () => {
  it('hard pots the straight ball (verified by simulating its shot)', () => {
    const balls = straightPot()
    const shot = bestShot(balls, matchOn(SOLID), 'hard', seeded(11))
    const sim = simulate(balls, shot)
    expect(sim.balls.find((b) => b.n === 1).pocketed).toBe(true)
    expect(sim.balls.find((b) => b.n === 0).pocketed).toBe(false) // no scratch
  })

  it('first contact is always a legal target ball, never the opponent’s', () => {
    // only stripes are legal for the shooter; solids sit CLOSER to the cue but
    // off the line to the stripe — the bot must go around them, not through
    const balls = [mk(0, -0.6, 0), mk(2, -0.3, 0.3), mk(3, -0.25, -0.35), mk(11, 0.5, 0.2)]
    const shot = bestShot(balls, matchOn(STRIPE), 'hard', seeded(3))
    const sim = simulate(balls, shot)
    const first = sim.firstHit ? (sim.firstHit.a === 0 ? sim.firstHit.b : sim.firstHit.a) : null
    expect(first).toBe(11)
  })

  it('falls back to a soft safety toward a legal ball when nothing is makeable', () => {
    // the only stripe is fully walled off by solids — no clean pot exists
    const balls = [
      mk(0, -0.9, 0),
      mk(9, 0.9, 0),
      mk(1, 0.8, 0.06),
      mk(2, 0.8, -0.06),
      mk(3, 0.86, 0.12),
      mk(4, 0.86, -0.12),
      mk(5, 0.8, 0),
    ]
    const shot = bestShot(balls, matchOn(STRIPE), 'hard', seeded(5))
    expect(shot.power).toBeLessThanOrEqual(0.5) // a controlled safety, not a slam
  })

  it('difficulty levels: easy is wobblier and searches less than hard', () => {
    expect(LEVELS.easy.sigma).toBeGreaterThan(LEVELS.medium.sigma)
    expect(LEVELS.medium.sigma).toBeGreaterThan(LEVELS.hard.sigma)
    expect(LEVELS.hard.candidates).toBeGreaterThan(LEVELS.easy.candidates)
  })

  it('is deterministic under an injected rng', () => {
    const balls = straightPot()
    const a = bestShot(balls, matchOn(SOLID), 'medium', seeded(21))
    const b = bestShot(balls, matchOn(SOLID), 'medium', seeded(21))
    expect(a).toEqual(b)
  })
})

describe('pool/ai — ball in hand', () => {
  it('picks a legal spot with a clean look at a target', () => {
    const balls = straightPot().map((b) => (b.n === 0 ? { ...b, pocketed: true } : b))
    const m = matchOn(SOLID)
    const s = bestPlacement(balls, m)
    expect(Math.abs(s.x)).toBeLessThanOrEqual(TABLE.W / 2)
    expect(Math.abs(s.z)).toBeLessThanOrEqual(TABLE.H / 2)
  })
})

describe('objectBallsPotted: a branca e a oito não contam como ponto', () => {
  /**
   * É a única parcela positiva da nota de uma tacada. As duas exclusões são a
   * regra do jogo: invertidas, a IA passa a pontuar EXATAMENTE o que devia
   * evitar (encaçapar a branca) e a ignorar tudo o que realmente vale.
   */
  it('conta só as bolas de objeto', () => {
    expect(objectBallsPotted([1, 2, 3])).toBe(3)
    expect(objectBallsPotted([0, 1, 8])).toBe(1)
    expect(objectBallsPotted([0])).toBe(0)
    expect(objectBallsPotted([8])).toBe(0)
    expect(objectBallsPotted([0, 8])).toBe(0)
    expect(objectBallsPotted([])).toBe(0)
    expect(objectBallsPotted(null)).toBe(0)
  })
})

describe('bestPlacement: sem tacada possível, volta para o ponto da casa', () => {
  /**
   * `potCandidates(...).length > 0` é o que faz a busca ACEITAR um lugar. Com
   * `>= 0` toda posição serve, a busca para na primeira da grade e a IA pousa a
   * branca no canto da mesa com bola nenhuma na mira -- exatamente o oposto do
   * que a bola na mão existe para fazer.
   */
  it('nenhuma bola de objeto na mesa: usa o ponto da casa', () => {
    // Só a branca, e encaçapada (é o que dá bola na mão). Sem alvo legal
    // nenhum, nenhum lugar da grade serve.
    const balls = [
      { n: 0, x: 0, z: 0, vx: 0, vz: 0, pocketed: true },
      { n: 8, x: TABLE.W / 4, z: 0, vx: 0, vz: 0, pocketed: true },
    ]
    const s = bestPlacement(balls, matchOn(SOLID))
    expect(s).toEqual({ x: -TABLE.W / 4, z: 0 })
  })
})
