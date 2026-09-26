/**
 * SINUCA — pure billiards physics for the RoqueOS Games gallery.
 *
 * A real (simplified-but-believable) pool simulation on the 2D table plane —
 * the 3D scene only *renders* it. Deterministic (no Math.random anywhere; the
 * rack takes an injectable rng), framework-free and fully unit-testable, which
 * is also what lets the AI *play by simulating actual shots*.
 *
 * Model:
 * - Balls slide then roll: two friction regimes (sliding decel is stronger and
 *   burns off `follow`; rolling decel is gentle).
 * - Strike applies velocity + spin: `follow` (top/draw — kicks the cue ball
 *   along/against its incoming line when it first meets an object ball) and
 *   `side` (english — bends the rebound off a cushion).
 * - Ball-ball impact: equal masses, restitution on the normal components.
 * - Cushions reflect with restitution; pockets capture near their mouths.
 * - step() advances with fixed substeps and records events
 *   ({type:'hit'|'cushion'|'pocket', ...}) that the 8-ball rules consume.
 *
 * Units: meters/seconds. Table is an 8-ft playfield, centre at the origin —
 * x along the long axis (head at -x, foot at +x), z across.
 */

export const TABLE = {
  W: 2.24, // playfield length (x)
  H: 1.12, // playfield width (z)
  R: 0.028575, // ball radius (57.15 mm ball)
}

const HW = TABLE.W / 2
const HH = TABLE.H / 2

// 6 pockets: 4 corners + 2 sides (on the long rails). `r` is the capture
// radius at the mouth — a ball whose centre gets that close falls in.
export const POCKETS = [
  { id: 0, x: -HW, z: -HH, r: 0.072 },
  { id: 1, x: HW, z: -HH, r: 0.072 },
  { id: 2, x: -HW, z: HH, r: 0.072 },
  { id: 3, x: HW, z: HH, r: 0.072 },
  { id: 4, x: 0, z: -HH, r: 0.06 },
  { id: 5, x: 0, z: HH, r: 0.06 },
]

// friction / impact tuning (feel-tuned for a 2.24 m table — cloth drags and
// cushions absorb like a real table; a glassy table made every long shot
// return off the far rail and re-kiss the cue ball)
const DECEL_ROLL = 0.8 // m/s² while rolling
const DECEL_SLIDE = 2.6 // m/s² while sliding (fresh off a strike)
const SLIDE_TO_ROLL = 3.2 // 1/s — how fast the slide phase settles into roll
const BALL_E = 0.94 // ball-ball restitution (normal)
const CUSHION_E = 0.58 // cushion restitution (normal)
const CUSHION_TANGENT = 0.86 // tangential speed kept off a cushion
const SIDE_KICK = 0.35 // english → tangential kick at the cushion
const FOLLOW_KICK = 0.55 // follow/draw → kick along the old line at first hit
const STOP_EPS = 0.02 // m/s — below this a ball is at rest
const MAX_SHOT_TIME = 14 // s — hard cap so a sim can never spin forever
const SUB_DT = 1 / 480 // fixed physics substep

export const MIN_SPEED = 0.5 // strike power 0..1 maps into this range
export const MAX_SPEED = 5.5

const dist = (a, b) => Math.hypot(a.x - b.x, a.z - b.z)

/** Standard set: 0 = cue, 1-7 solids, 8, 9-15 stripes. */
export const isSolid = (n) => n >= 1 && n <= 7
export const isStripe = (n) => n >= 9 && n <= 15

const mkBall = (n, x, z) => ({
  n,
  x,
  z,
  vx: 0,
  vz: 0,
  slide: 0, // remaining "sliding" intensity (0..1) — decays into pure roll
  follow: 0, // signed top/draw carried until the first ball contact
  side: 0, // signed english carried until cushions bleed it off
  pocketed: false,
})

/**
 * Racked 8-ball table: cue on the head spot, triangle on the foot spot with
 * the 8 in the middle of row 3 and a solid + a stripe on the back corners
 * (standard constraints). `rng` is injectable so tests are deterministic.
 */
export function rack8(rng = Math.random) {
  const R = TABLE.R
  const gap = 0.0002
  const balls = [mkBall(0, -TABLE.W / 4, 0)]

  // shuffle 1-7 + 9-15, then enforce the constraints by swapping
  const rest = [1, 2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 14, 15]
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[rest[i], rest[j]] = [rest[j], rest[i]]
  }
  // slot indexes (row-major, apex first): 0 | 1 2 | 3 4 5 | 6..9 | 10..14
  const order = new Array(15).fill(0)
  order[4] = 8 // centre of row 3
  const others = rest.slice()
  // back corners (slots 10 and 14): one solid, one stripe
  const si = others.findIndex((n) => isSolid(n))
  order[10] = others.splice(si, 1)[0]
  const ti = others.findIndex((n) => isStripe(n))
  order[14] = others.splice(ti, 1)[0]
  for (let s = 0, k = 0; s < 15; s++) {
    if (s === 4 || s === 10 || s === 14) continue
    order[s] = others[k++]
  }

  const fx = TABLE.W / 4 // foot spot
  const dx = R * Math.sqrt(3) + gap
  let slot = 0
  for (let row = 0; row < 5; row++) {
    for (let i = 0; i <= row; i++) {
      const x = fx + row * dx
      const z = (i - row / 2) * (2 * R + gap)
      balls.push(mkBall(order[slot++], x, z))
    }
  }
  return balls
}

/** Fresh shot state around a ball list (events accumulate during step()). */
export function createShot(balls) {
  return { balls, t: 0, events: [], firstHit: null }
}

/**
 * Strike the cue ball. angle: radians on the table plane (0 = +x).
 * power: 0..1 → speed. spin: { side: -1..1 (english), follow: -1..1
 * (top positive / draw negative) }.
 */
export function strike(state, { angle, power, spin = {} }) {
  const cue = state.balls.find((b) => b.n === 0 && !b.pocketed)
  if (!cue) return false
  const p = Math.min(1, Math.max(0, power))
  const speed = MIN_SPEED + (MAX_SPEED - MIN_SPEED) * p
  cue.vx = Math.cos(angle) * speed
  cue.vz = Math.sin(angle) * speed
  cue.slide = 1
  cue.follow = Math.min(1, Math.max(-1, spin.follow || 0)) * p
  cue.side = Math.min(1, Math.max(-1, spin.side || 0)) * p
  state.events.push({ type: 'strike', angle, power: p })
  return true
}

const speedOf = (b) => Math.hypot(b.vx, b.vz)

/** True once every live ball is at rest. */
export function settled(state) {
  return state.balls.every((b) => b.pocketed || speedOf(b) < STOP_EPS)
}

function integrate(b, dt) {
  const v = speedOf(b)
  if (v < STOP_EPS) {
    b.vx = 0
    b.vz = 0
    return
  }
  b.x += b.vx * dt
  b.z += b.vz * dt
  // friction: blend sliding→rolling decel by the remaining slide intensity
  const decel = DECEL_ROLL + (DECEL_SLIDE - DECEL_ROLL) * b.slide
  const nv = Math.max(0, v - decel * dt)
  const k = v > 0 ? nv / v : 0
  b.vx *= k
  b.vz *= k
  b.slide *= Math.exp(-SLIDE_TO_ROLL * dt)
  b.side *= Math.exp(-0.4 * dt)
}

function hitCushions(state, b) {
  // pocket capture first: near any mouth → the ball drops (no reflection)
  for (const p of POCKETS) {
    if (Math.hypot(b.x - p.x, b.z - p.z) < p.r) {
      b.pocketed = true
      b.vx = 0
      b.vz = 0
      state.events.push({ type: 'pocket', ball: b.n, pocket: p.id, t: state.t })
      return
    }
  }
  const lim = { x: HW - TABLE.R, z: HH - TABLE.R }
  for (const ax of ['x', 'z']) {
    const va = ax === 'x' ? 'vx' : 'vz'
    const vt = ax === 'x' ? 'vz' : 'vx'
    if (Math.abs(b[ax]) > lim[ax] && b[ax] * b[va] > 0) {
      b[ax] = Math.sign(b[ax]) * lim[ax]
      b[va] = -b[va] * CUSHION_E
      // english bends the rebound: kick the tangential component
      b[vt] = b[vt] * CUSHION_TANGENT + b.side * SIDE_KICK * Math.sign(b[va] || 1)
      b.side *= 0.45
      state.events.push({ type: 'cushion', ball: b.n, t: state.t })
    }
  }
}

function collide(state, a, b) {
  const d = dist(a, b)
  const minD = 2 * TABLE.R
  if (d === 0 || d >= minD) return
  const nx = (b.x - a.x) / d
  const nz = (b.z - a.z) / d
  // separate the overlap symmetrically
  const push = (minD - d) / 2
  a.x -= nx * push
  a.z -= nz * push
  b.x += nx * push
  b.z += nz * push
  // relative speed along the normal — only resolve if approaching
  const van = a.vx * nx + a.vz * nz
  const vbn = b.vx * nx + b.vz * nz
  if (van - vbn <= 0) return
  const at = { x: a.vx - van * nx, z: a.vz - van * nz } // tangential parts stay
  const bt = { x: b.vx - vbn * nx, z: b.vz - vbn * nz }
  // equal masses: exchange normal components (with restitution)
  const an = vbn * BALL_E
  const bn = van * BALL_E
  const dirBefore = speedOf(a) > 0 ? { x: a.vx / speedOf(a), z: a.vz / speedOf(a) } : { x: 0, z: 0 }
  a.vx = at.x + an * nx
  a.vz = at.z + an * nz
  b.vx = bt.x + bn * nx
  b.vz = bt.z + bn * nz
  b.slide = Math.max(b.slide, 0.35)
  // follow/draw acts at the FIRST object-ball contact of the cue ball
  if (a.n === 0 && a.follow !== 0) {
    a.vx += dirBefore.x * a.follow * FOLLOW_KICK * MAX_SPEED * 0.35
    a.vz += dirBefore.z * a.follow * FOLLOW_KICK * MAX_SPEED * 0.35
    a.follow = 0
  }
  const ev = { type: 'hit', a: a.n, b: b.n, t: state.t }
  state.events.push(ev)
  if (!state.firstHit && (a.n === 0 || b.n === 0)) state.firstHit = ev
}

/** Advance the shot by `dt` seconds (fixed substeps inside). */
export function step(state, dt) {
  let remaining = Math.min(dt, 0.1) // clamp a huge frame gap
  while (remaining > 0 && state.t < MAX_SHOT_TIME && !settled(state)) {
    const h = Math.min(SUB_DT, remaining)
    const live = state.balls.filter((b) => !b.pocketed)
    for (const b of live) integrate(b, h)
    for (let i = 0; i < live.length; i++) {
      for (let j = i + 1; j < live.length; j++) collide(state, live[i], live[j])
    }
    for (const b of live) hitCushions(state, b)
    state.t += h
    remaining -= h
  }
  return settled(state) || state.t >= MAX_SHOT_TIME
}

/** Run a whole shot to rest (the AI's simulator). Returns the state. */
export function simulate(balls, shot) {
  const st = createShot(balls.map((b) => ({ ...b })))
  strike(st, shot)
  let guard = 0
  while (!step(st, 0.1) && guard++ < 400) {
    /* advance until settled */
  }
  return st
}

/** Legal ball-in-hand placement: inside the field, not overlapping a ball. */
export function placeCueBall(balls, x, z) {
  const lim = { x: HW - TABLE.R, z: HH - TABLE.R }
  const px = Math.min(lim.x, Math.max(-lim.x, x))
  const pz = Math.min(lim.z, Math.max(-lim.z, z))
  for (const b of balls) {
    if (b.n === 0 || b.pocketed) continue
    if (Math.hypot(px - b.x, pz - b.z) < 2 * TABLE.R + 0.002) return false
  }
  const cue = balls.find((b) => b.n === 0)
  cue.x = px
  cue.z = pz
  cue.vx = 0
  cue.vz = 0
  cue.pocketed = false
  return true
}
