import { describe, it, expect } from 'vitest'
import {
  TABLE,
  POCKETS,
  rack8,
  createShot,
  strike,
  step,
  settled,
  simulate,
  placeCueBall,
  isSolid,
  isStripe,
} from '../src/engine.js'

// tiny deterministic rng for rack shuffling
const seeded = (seed) => {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

const ballAt = (st, n) => st.balls.find((b) => b.n === n)

describe('pool/engine — rack', () => {
  it('deals cue + 15 balls with the 8 in the middle and mixed back corners', () => {
    const balls = rack8(seeded(7))
    expect(balls).toHaveLength(16)
    expect(balls[0].n).toBe(0) // cue first, on the head side
    expect(balls[0].x).toBeLessThan(0)
    // slot 4 (centre of row 3) is the 5th racked ball → the 8
    expect(balls[5].n).toBe(8)
    // back corners: one solid, one stripe
    const corners = [balls[11].n, balls[15].n]
    expect(corners.some(isSolid)).toBe(true)
    expect(corners.some(isStripe)).toBe(true)
    // no overlaps in the rack
    for (let i = 1; i < balls.length; i++) {
      for (let j = i + 1; j < balls.length; j++) {
        const d = Math.hypot(balls[i].x - balls[j].x, balls[i].z - balls[j].z)
        expect(d).toBeGreaterThanOrEqual(2 * TABLE.R - 1e-9)
      }
    }
  })

  it('is deterministic for the same seed and varies across seeds', () => {
    const a = rack8(seeded(42)).map((b) => b.n)
    const b = rack8(seeded(42)).map((b) => b.n)
    const c = rack8(seeded(43)).map((b) => b.n)
    expect(a).toEqual(b)
    expect(a).not.toEqual(c)
  })
})

describe('pool/engine — motion + friction', () => {
  it('a struck ball slows down and eventually rests (friction)', () => {
    const st = createShot([{ ...rack8(seeded(1))[0] }]) // lone cue ball
    strike(st, { angle: 0, power: 0.3 })
    const v0 = Math.hypot(st.balls[0].vx, st.balls[0].vz)
    step(st, 0.5)
    const v1 = Math.hypot(st.balls[0].vx, st.balls[0].vz)
    expect(v1).toBeLessThan(v0)
    let guard = 0
    while (!step(st, 0.25) && guard++ < 200) {
      /* run to rest */
    }
    expect(settled(st)).toBe(true)
  })

  it('a full break settles within the time cap and stays on the table', () => {
    const st = createShot(rack8(seeded(3)))
    strike(st, { angle: 0, power: 1 })
    let guard = 0
    while (!step(st, 0.1) && guard++ < 400) {
      /* run */
    }
    expect(settled(st)).toBe(true)
    for (const b of st.balls) {
      if (b.pocketed) continue
      expect(Math.abs(b.x)).toBeLessThanOrEqual(TABLE.W / 2 - TABLE.R + 1e-6)
      expect(Math.abs(b.z)).toBeLessThanOrEqual(TABLE.H / 2 - TABLE.R + 1e-6)
    }
  })
})

describe('pool/engine — collisions + events', () => {
  it('records the cue ball’s FIRST hit and transfers momentum head-on', () => {
    const st = createShot([
      { n: 0, x: -0.5, z: 0, vx: 0, vz: 0, slide: 0, follow: 0, side: 0, pocketed: false },
      { n: 1, x: 0, z: 0, vx: 0, vz: 0, slide: 0, follow: 0, side: 0, pocketed: false },
    ])
    strike(st, { angle: 0, power: 0.5 })
    let guard = 0
    while (!step(st, 0.05) && guard++ < 400) {
      /* run */
    }
    expect(st.firstHit).toBeTruthy()
    expect([st.firstHit.a, st.firstHit.b]).toContain(0)
    expect([st.firstHit.a, st.firstHit.b]).toContain(1)
    // head-on: the object ball ends up further along +x than the cue ball
    expect(ballAt(st, 1).x).toBeGreaterThan(ballAt(st, 0).x)
  })

  it('a cushion bounce reflects the ball back into the field', () => {
    const st = createShot([
      { n: 0, x: 0.9, z: 0, vx: 0, vz: 0, slide: 0, follow: 0, side: 0, pocketed: false },
    ])
    strike(st, { angle: 0, power: 0.4 }) // straight at the foot rail (z=0 → no pocket)
    let guard = 0
    while (!step(st, 0.05) && guard++ < 400) {
      /* run */
    }
    expect(st.events.some((e) => e.type === 'cushion')).toBe(true)
    expect(ballAt(st, 0).x).toBeLessThan(TABLE.W / 2 - TABLE.R + 1e-6)
  })

  it('draw pulls the cue ball back after a head-on contact; follow chases', () => {
    // gentle power so the object ball doesn't return off the far rail and
    // re-kiss the cue — this isolates the spin effect at the contact
    const mk = (follow) => {
      const balls = [
        { n: 0, x: -0.4, z: 0, vx: 0, vz: 0, slide: 0, follow: 0, side: 0, pocketed: false },
        { n: 1, x: 0, z: 0, vx: 0, vz: 0, slide: 0, follow: 0, side: 0, pocketed: false },
      ]
      return simulate(balls, { angle: 0, power: 0.3, spin: { follow } })
    }
    const contactX = -2 * TABLE.R // where the cue ball meets the object ball
    const drawn = ballAt(mk(-1), 0).x
    const followed = ballAt(mk(1), 0).x
    expect(drawn).toBeLessThan(contactX - 0.02) // pulled back behind the contact
    expect(followed).toBeGreaterThan(contactX + 0.02) // chased forward past it
    expect(drawn).toBeLessThan(followed)
  })

  it('is deterministic: identical shots give identical outcomes', () => {
    const shot = { angle: 0.15, power: 0.8, spin: { side: 0.3, follow: -0.4 } }
    const a = simulate(rack8(seeded(9)), shot)
    const b = simulate(rack8(seeded(9)), shot)
    expect(a.balls.map((x) => [x.n, x.x.toFixed(9), x.z.toFixed(9), x.pocketed])).toEqual(
      b.balls.map((x) => [x.n, x.x.toFixed(9), x.z.toFixed(9), x.pocketed]),
    )
  })
})

describe('pool/engine — pockets', () => {
  it('a ball aimed into a corner pocket is captured (event + flag)', () => {
    const p = POCKETS[1] // (+x, -z) corner
    const st = createShot([
      {
        n: 3,
        x: p.x - 0.4,
        z: p.z + 0.4,
        vx: 0,
        vz: 0,
        slide: 0,
        follow: 0,
        side: 0,
        pocketed: false,
      },
    ])
    // aim straight at the pocket mouth
    const ang = Math.atan2(p.z - (p.z + 0.4), p.x - (p.x - 0.4))
    st.balls[0].vx = Math.cos(ang) * 1.6
    st.balls[0].vz = Math.sin(ang) * 1.6
    let guard = 0
    while (!step(st, 0.05) && guard++ < 400) {
      /* run */
    }
    expect(ballAt(st, 3).pocketed).toBe(true)
    expect(st.events.some((e) => e.type === 'pocket' && e.ball === 3)).toBe(true)
  })
})

describe('pool/engine — ball in hand', () => {
  it('places the cue ball on a free spot and rejects an occupied one', () => {
    const balls = rack8(seeded(5))
    expect(placeCueBall(balls, -0.3, 0.2)).toBe(true)
    const cue = balls.find((b) => b.n === 0)
    expect(cue.x).toBeCloseTo(-0.3, 6)
    // right on top of the apex ball → rejected
    const apex = balls[1]
    expect(placeCueBall(balls, apex.x, apex.z)).toBe(false)
  })

  it('clamps a placement outside the field back inside', () => {
    const balls = rack8(seeded(5))
    expect(placeCueBall(balls, -99, 99)).toBe(true)
    const cue = balls.find((b) => b.n === 0)
    expect(Math.abs(cue.x)).toBeLessThanOrEqual(TABLE.W / 2 - TABLE.R)
    expect(Math.abs(cue.z)).toBeLessThanOrEqual(TABLE.H / 2 - TABLE.R)
  })
})
