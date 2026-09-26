import { describe, it, expect } from 'vitest'
import { createMatch, evaluateShot, legalTargets, remaining, SOLID, STRIPE } from '../src/rules.js'

// hand-built settled "shot" states — we test the JUDGE, not the physics
const ball = (n, pocketed = false) => ({ n, x: 0, z: 0, pocketed })
const fullTable = (pocketedNs = []) =>
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15].map((n) => ball(n, pocketedNs.includes(n)))
const shotOf = ({ first = null, pots = [], balls }) => ({
  balls,
  firstHit: first == null ? null : { type: 'hit', a: 0, b: first },
  events: pots.map((n) => ({ type: 'pocket', ball: n })),
})
const afterBreak = () => {
  const m = createMatch()
  evaluateShot(m, shotOf({ first: 1, pots: [], balls: fullTable() })) // dry break
  return m
}

describe('pool/rules — groups', () => {
  it('first legal pot after the break assigns the groups', () => {
    const m = afterBreak() // shooter is now 2
    const v = evaluateShot(m, shotOf({ first: 9, pots: [9], balls: fullTable([9]) }))
    expect(v.foul).toBe(false)
    expect(m.groups[2]).toBe(STRIPE)
    expect(m.groups[1]).toBe(SOLID)
    expect(m.shooter).toBe(2) // potted their own → keeps shooting
  })

  it('a pot ON the break does not assign groups', () => {
    const m = createMatch()
    evaluateShot(m, shotOf({ first: 1, pots: [3], balls: fullTable([3]) }))
    expect(m.groups[1]).toBeNull()
    expect(m.shooter).toBe(1) // potted a ball without foul → still at the table
  })

  it('legalTargets: open → all but the 8; assigned → yours; cleared → the 8', () => {
    const m = createMatch()
    expect(legalTargets(m, fullTable())).not.toContain(8)
    expect(legalTargets(m, fullTable())).toHaveLength(14)
    m.groups = { 1: SOLID, 2: STRIPE }
    expect(legalTargets(m, fullTable())).toEqual([1, 2, 3, 4, 5, 6, 7])
    const cleared = fullTable([1, 2, 3, 4, 5, 6, 7])
    expect(legalTargets(m, cleared)).toEqual([8])
    expect(remaining(cleared, SOLID)).toBe(0)
  })
})

describe('pool/rules — fouls', () => {
  it('a scratch is a foul: ball in hand + turn passes', () => {
    const m = afterBreak()
    const v = evaluateShot(m, shotOf({ first: 9, pots: [0], balls: fullTable([0]) }))
    expect(v.foul).toBe(true)
    expect(v.reasons).toContain('scratch')
    expect(m.ballInHand).toBe(true)
    expect(m.shooter).toBe(1)
  })

  it('missing everything is a foul (no contact)', () => {
    const m = afterBreak()
    const v = evaluateShot(m, shotOf({ first: null, pots: [], balls: fullTable() }))
    expect(v.reasons).toContain('no-contact')
    expect(m.ballInHand).toBe(true)
  })

  it('touching the opponent group first is a foul; own group is not', () => {
    const m = afterBreak()
    m.groups = { 1: SOLID, 2: STRIPE }
    // shooter 2 (stripes) hits a solid first → foul
    const bad = evaluateShot(m, shotOf({ first: 3, pots: [], balls: fullTable() }))
    expect(bad.reasons).toContain('wrong-ball')
    // back to shooter 1 (solids) hitting a solid → clean
    const ok = evaluateShot(m, shotOf({ first: 3, pots: [], balls: fullTable() }))
    expect(ok.foul).toBe(false)
  })

  it('hitting the 8 first on an open table is a foul', () => {
    const m = afterBreak()
    const v = evaluateShot(m, shotOf({ first: 8, pots: [], balls: fullTable() }))
    expect(v.reasons).toContain('wrong-ball')
  })

  it('hitting the 8 first is LEGAL once your group is cleared', () => {
    const m = afterBreak()
    m.groups = { 2: SOLID, 1: STRIPE }
    const balls = fullTable([1, 2, 3, 4, 5, 6, 7]) // shooter 2's solids all gone
    const v = evaluateShot(m, shotOf({ first: 8, pots: [], balls }))
    expect(v.foul).toBe(false)
    expect(m.shooter).toBe(1) // no pot → turn passes, but no foul
  })
})

describe('pool/rules — the 8 decides games', () => {
  it('potting the 8 early loses on the spot', () => {
    const m = afterBreak() // shooter 2
    m.groups = { 1: SOLID, 2: STRIPE }
    const v = evaluateShot(m, shotOf({ first: 9, pots: [8], balls: fullTable([8]) }))
    expect(m.winner).toBe(1)
    expect(v.over).toBe(true)
  })

  it('potting the 8 legally after clearing your group wins', () => {
    const m = afterBreak() // shooter 2
    m.groups = { 2: SOLID, 1: STRIPE }
    const balls = fullTable([1, 2, 3, 4, 5, 6, 7, 8])
    const v = evaluateShot(m, shotOf({ first: 8, pots: [8], balls }))
    expect(m.winner).toBe(2)
    expect(v.over).toBe(true)
  })

  it('scratching while potting the 8 loses even with the group cleared', () => {
    const m = afterBreak() // shooter 2
    m.groups = { 2: SOLID, 1: STRIPE }
    const balls = fullTable([1, 2, 3, 4, 5, 6, 7, 8, 0])
    evaluateShot(m, shotOf({ first: 8, pots: [8, 0], balls }))
    expect(m.winner).toBe(1)
  })

  it('the 8 on the BREAK is re-spotted, nobody loses', () => {
    const m = createMatch()
    const v = evaluateShot(m, shotOf({ first: 1, pots: [8], balls: fullTable([8]) }))
    expect(v.respot8).toBe(true)
    expect(m.winner).toBe(0)
  })
})
