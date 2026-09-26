/**
 * SINUCA — the 3D room. A procedural Brunswick Gold Crown-style table (walnut
 * body, pearl sights, chrome corner caps, leather pockets) inside a warm bar
 * (checkered floor, wainscot walls, counter + stools + bottles, hanging lamps),
 * rendered with Three.js. All geometry/textures are generated — no external
 * models — so the bundle stays light and the unit tests can stub `three`.
 *
 * The physics lives in engine.js (table plane, meters); this module only
 * RENDERS: syncBalls() mirrors positions + rolls the balls visually, the aim
 * guide draws the pro guideline (cue line → ghost ball → object-ball arrow),
 * and the cue stick pulls back with power and lunges on strike.
 *
 * createPoolScene() is stub/WebGL-failure safe: any construction error returns
 * a no-op API so specs (and broken GPUs) never throw.
 */
import * as THREE from 'three'
import { TABLE, POCKETS } from './engine'

export const CLOTH_Y = 0.8 // table bed height (m) — the component aims cameras at it
const BALL_R = TABLE.R
const HW = TABLE.W / 2
const HH = TABLE.H / 2
const RAIL_W = 0.14 // wooden rail width
const CUSHION_W = 0.05

// standard ball colours (index = ball number)
export const BALL_COLORS = [
  '#f6f1e7', // cue
  '#f7c948', // 1 yellow
  '#2563eb', // 2 blue
  '#ef4444', // 3 red
  '#7c3aed', // 4 purple
  '#fb923c', // 5 orange
  '#16a34a', // 6 green
  '#9f1239', // 7 maroon
  '#111318', // 8 black
  '#f7c948',
  '#2563eb',
  '#ef4444',
  '#7c3aed',
  '#fb923c',
  '#16a34a',
  '#9f1239',
]

const canvasTex = (w, h, draw, { linear = false } = {}) => {
  const cv = document.createElement('canvas')
  cv.width = w
  cv.height = h
  try {
    const g = cv.getContext('2d')
    if (g) draw(g, w, h)
  } catch {
    /* stubbed context in tests */
  }
  const tex = new THREE.CanvasTexture(cv)
  // colour textures are sRGB; data textures (normal maps) must stay linear
  if ('colorSpace' in tex) {
    if (linear && THREE.NoColorSpace !== undefined) tex.colorSpace = THREE.NoColorSpace
    else if (!linear && THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace
  }
  return tex
}

// ── procedural textures ───────────────────────────────────────────────────────
const feltTexture = (tint = '#26824a') =>
  canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = tint
    g.fillRect(0, 0, w, h)
    // woven-cloth noise: hashed positions (a plain lattice reads as polka dots)
    for (let i = 0; i < 26000; i++) {
      const x = ((Math.sin(i * 12.9898) * 43758.5453) % 1) * w
      const y = ((Math.sin(i * 78.233) * 12578.1459) % 1) * h
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.016)' : 'rgba(0,0,0,0.02)'
      g.fillRect(Math.abs(x), Math.abs(y), 1, 1)
    }
  })

const woodTexture = (base = '#4a2c18', streak = '#2e1a0d') =>
  canvasTex(512, 256, (g, w, h) => {
    g.fillStyle = base
    g.fillRect(0, 0, w, h)
    for (let i = 0; i < 46; i++) {
      const y = (i / 46) * h + Math.sin(i * 3.7) * 5
      g.strokeStyle = i % 2 ? `${streak}55` : 'rgba(255,220,180,0.05)'
      g.lineWidth = 1 + (i % 3)
      g.beginPath()
      for (let x = 0; x <= w; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + i) * 3.5)
      g.stroke()
    }
  })

// A normal map derived from the grain height field (Sobel) — gives the rails
// real relief under the spot light instead of a flat painted look.
const woodNormalTexture = () =>
  canvasTex(
    512,
    256,
    (g, w, h) => {
      const hc = document.createElement('canvas')
      hc.width = w
      hc.height = h
      let src
      try {
        const hg = hc.getContext('2d')
        hg.fillStyle = '#808080'
        hg.fillRect(0, 0, w, h)
        for (let i = 0; i < 64; i++) {
          const y = (i / 64) * h + Math.sin(i * 3.1) * 4
          hg.strokeStyle = i % 2 ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.35)'
          hg.lineWidth = 1 + (i % 3)
          hg.beginPath()
          for (let x = 0; x <= w; x += 8) hg.lineTo(x, y + Math.sin(x * 0.02 + i) * 3)
          hg.stroke()
        }
        src = hg.getImageData(0, 0, w, h).data
      } catch {
        src = null
      }
      // stubbed canvas (tests) → flat normal, no throw
      if (!src || typeof src.length !== 'number') {
        g.fillStyle = '#8080ff'
        g.fillRect(0, 0, w, h)
        return
      }
      const out = g.createImageData(w, h)
      const at = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255
      const strength = 2.4
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          const dx = (at(x - 1, y) - at(x + 1, y)) * strength
          const dy = (at(x, y - 1) - at(x, y + 1)) * strength
          const len = Math.hypot(dx, dy, 1)
          const idx = (y * w + x) * 4
          out.data[idx] = (dx / len) * 0.5 * 255 + 128
          out.data[idx + 1] = (dy / len) * 0.5 * 255 + 128
          out.data[idx + 2] = (1 / len) * 0.5 * 255 + 128
          out.data[idx + 3] = 255
        }
      }
      g.putImageData(out, 0, 0)
    },
    { linear: true },
  )

// Equirectangular "warm bar" environment → PMREM → scene.environment, so the
// balls and chrome actually reflect the room and its lamps (the biggest jump
// from "matte plastic" to "glossy pool balls").
const equirectEnvTexture = () => {
  const tex = canvasTex(1024, 512, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h)
    grad.addColorStop(0, '#3a2c22') // warm ceiling
    grad.addColorStop(0.42, '#5a4433')
    grad.addColorStop(0.56, '#2a2420')
    grad.addColorStop(1, '#0e0b09') // dark floor
    g.fillStyle = grad
    g.fillRect(0, 0, w, h)
    // bright hanging lamps — the crisp specular highlights on the gloss
    for (const cx of [0.32, 0.5, 0.68]) {
      const gx = g.createRadialGradient(w * cx, h * 0.2, 2, w * cx, h * 0.2, w * 0.06)
      gx.addColorStop(0, '#fff7e2')
      gx.addColorStop(1, 'rgba(255,240,210,0)')
      g.fillStyle = gx
      g.fillRect(0, 0, w, h)
    }
    // warm side glows (windows / neon)
    for (const cx of [0.06, 0.94]) {
      const gx = g.createRadialGradient(w * cx, h * 0.42, 2, w * cx, h * 0.42, w * 0.1)
      gx.addColorStop(0, 'rgba(255,180,120,0.55)')
      gx.addColorStop(1, 'rgba(255,180,120,0)')
      g.fillStyle = gx
      g.fillRect(0, 0, w, h)
    }
  })
  if ('mapping' in tex && THREE.EquirectangularReflectionMapping !== undefined) {
    tex.mapping = THREE.EquirectangularReflectionMapping
  }
  return tex
}

// warm dark wood-plank bar floor — a harsh diner checkerboard fought the table
// for attention; dark walnut boards keep the table the hero and read as a real
// pool hall. Deterministic (hashed) so the cover capture is stable.
const floorPlankTexture = () =>
  canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#22140b'
    g.fillRect(0, 0, w, h)
    const boards = 6
    const bh = h / boards
    for (let i = 0; i < boards; i++) {
      const y = i * bh
      const t = (((Math.sin(i * 91.7) * 43758.5) % 1) + 1) % 1
      const r = 44 + Math.floor(t * 18)
      g.fillStyle = `rgb(${r}, ${Math.floor(r * 0.6)}, ${Math.floor(r * 0.38)})`
      g.fillRect(0, y + 1, w, bh - 2)
      // dark seam between boards
      g.fillStyle = 'rgba(0,0,0,0.6)'
      g.fillRect(0, y, w, 2)
      // long grain streaks
      for (let s = 0; s < 26; s++) {
        const u = (((Math.sin((i * 26 + s) * 12.9898) * 43758.5453) % 1) + 1) % 1
        const gy = y + u * bh
        g.strokeStyle = s % 2 ? 'rgba(0,0,0,0.16)' : 'rgba(130,88,54,0.1)'
        g.lineWidth = 1
        g.beginPath()
        g.moveTo(0, gy)
        for (let x = 0; x <= w; x += 24) g.lineTo(x, gy + Math.sin(x * 0.03 + s) * 1.5)
        g.stroke()
      }
    }
  })

// equirect ball skin: solid colour or stripe band, number in a white circle
const ballTexture = (n) =>
  canvasTex(256, 128, (g, w, h) => {
    const color = BALL_COLORS[n]
    const stripe = n >= 9
    g.fillStyle = stripe || n === 0 ? '#f6f1e7' : color
    g.fillRect(0, 0, w, h)
    if (stripe) {
      g.fillStyle = color
      g.fillRect(0, h * 0.25, w, h * 0.5)
    }
    if (n === 0) {
      g.fillStyle = '#c0392b' // cue-ball spot
      g.beginPath()
      g.arc(w * 0.25, h * 0.5, 4, 0, Math.PI * 2)
      g.fill()
      return
    }
    for (const u of [0.25, 0.75]) {
      g.fillStyle = '#f6f1e7'
      g.beginPath()
      g.arc(w * u, h * 0.5, 15, 0, Math.PI * 2)
      g.fill()
      g.fillStyle = '#16181d'
      g.font = 'bold 17px sans-serif'
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.fillText(String(n), w * u, h * 0.52)
    }
  })

// radial-gradient pocket mouth: near-black centre → dark rim, so a FLAT disc
// sitting flush with the felt reads as a recessed hole. (A raised ring/cylinder
// reads as an "inverted" donut ON the cloth — the felt bed is a solid box and
// can't be cut, so the hole must be a flush disc with baked-in depth.)
const pocketMouthTexture = () =>
  canvasTex(128, 128, (g, w, h) => {
    g.clearRect(0, 0, w, h)
    const cx = w / 2
    const cy = h / 2
    const gr = g.createRadialGradient(cx, cy, 2, cx, cy, w / 2)
    gr.addColorStop(0, '#000000')
    gr.addColorStop(0.55, '#040404')
    gr.addColorStop(0.82, '#141210')
    gr.addColorStop(1, '#2a1c12')
    g.fillStyle = gr
    g.beginPath()
    g.arc(cx, cy, w / 2, 0, Math.PI * 2)
    g.fill()
  })

const artTexture = (a, b) =>
  canvasTex(128, 96, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, w, h)
    gr.addColorStop(0, a)
    gr.addColorStop(1, b)
    g.fillStyle = gr
    g.fillRect(0, 0, w, h)
    g.fillStyle = 'rgba(255,255,255,0.18)'
    g.beginPath()
    g.arc(w * 0.7, h * 0.35, 18, 0, Math.PI * 2)
    g.fill()
  })

/** Build everything and return the render API. */
export function createPoolScene({ canvas, lowEnd = false } = {}) {
  try {
    return buildScene(canvas, lowEnd)
  } catch {
    // stubbed three / dead WebGL: render nothing, break nothing
    const noop = () => {}
    return {
      syncBalls: noop,
      setAim: noop,
      setCue: noop,
      strikeCue: noop,
      setCameraPose: noop,
      screenToTable: () => null,
      setMarker: noop,
      resize: noop,
      render: noop,
      dispose: noop,
      ok: false,
    }
  }
}

function buildScene(canvas, lowEnd) {
  const disposables = []
  const track = (o) => {
    disposables.push(o)
    return o
  }
  const std = (opts) => track(new THREE.MeshStandardMaterial(opts))

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !lowEnd, alpha: false })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lowEnd ? 1.25 : 2))
  if (!lowEnd) {
    renderer.shadowMap.enabled = true
    renderer.shadowMap.type = THREE.PCFSoftShadowMap
  }

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(0x1a1318)
  scene.fog = new THREE.Fog(0x1a1318, 9, 22)

  // filmic tone mapping so the glossy highlights roll off like a real photo
  if (THREE.ACESFilmicToneMapping !== undefined) {
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.16
  }

  const camera = new THREE.PerspectiveCamera(50, 1, 0.05, 40)
  camera.position.set(0, 2.2, 2.6)
  camera.lookAt(0, CLOTH_Y, 0)

  // IBL: a warm-bar environment prefiltered into an irradiance/reflection map so
  // every physical material (balls, chrome) reflects the room + its lamps.
  try {
    if (THREE.PMREMGenerator) {
      const pmrem = new THREE.PMREMGenerator(renderer)
      const envSrc = equirectEnvTexture()
      const envRT = pmrem.fromEquirectangular(envSrc)
      if (envRT && envRT.texture) {
        scene.environment = envRT.texture
        disposables.push(envRT.texture)
      }
      envSrc.dispose?.()
      pmrem.dispose?.()
    }
  } catch {
    /* stub / no PMREM support — materials still shade from the lights */
  }

  // ── lights: moody bar + a strong billiard spot over the table ──────────────
  // low ambient + a tight, bright spot = the pool-hall "single lamp over the
  // felt" look: the cloth is the hero, the room falls into warm darkness.
  scene.add(new THREE.HemisphereLight(0xffe9c8, 0x2a2018, lowEnd ? 1.15 : 0.5))
  const spot = new THREE.SpotLight(0xfff1d6, lowEnd ? 2.0 : 3.4, 0, 0.82, 0.42, 1.05)
  spot.position.set(0, 2.95, 0)
  spot.target.position.set(0, CLOTH_Y, 0)
  if (!lowEnd) {
    spot.castShadow = true
    spot.shadow.mapSize.set(2048, 2048)
    spot.shadow.bias = -0.0004
  }
  scene.add(spot)
  scene.add(spot.target)
  const warmA = new THREE.PointLight(0xffb469, 0.85, 10)
  warmA.position.set(-2.6, 2.1, -1.6)
  scene.add(warmA)
  const warmB = new THREE.PointLight(0xff9d4d, 0.75, 10)
  warmB.position.set(2.8, 2.1, -1.4)
  scene.add(warmB)
  // front fill so the near cue ball never sinks into the shadow
  const warmC = new THREE.PointLight(0xffc98a, 0.8, 9)
  warmC.position.set(0, 1.9, 3.4)
  scene.add(warmC)

  // ── materials ───────────────────────────────────────────────────────────────
  const woodNormal = track(woodNormalTexture())
  const nrm = THREE.Vector2 ? new THREE.Vector2(0.6, 0.6) : null
  const feltMat = std({
    map: track(feltTexture('#1f7a45')),
    roughness: 0.86,
    metalness: 0,
    envMapIntensity: 0.2,
  })
  const woodMat = std({
    map: track(woodTexture('#5a3620', '#301a0c')),
    normalMap: woodNormal,
    ...(nrm ? { normalScale: nrm } : {}),
    roughness: 0.42,
    metalness: 0.12,
    envMapIntensity: 0.6,
  })
  const darkWoodMat = std({
    map: track(woodTexture('#3a2212', '#221004')),
    normalMap: woodNormal,
    ...(nrm ? { normalScale: nrm } : {}),
    roughness: 0.48,
    metalness: 0.1,
    envMapIntensity: 0.5,
  })
  // near-mirror chrome for the Gold Crown castings + diamond sights
  const chromeMat = std({ color: 0xdfe2e6, roughness: 0.1, metalness: 1, envMapIntensity: 1.4 })
  // lighter, more polished walnut for the rail cap (the top tier catches the
  // spot and reads as a finished, layered Gold Crown rail vs a plain box)
  const capMat = std({
    map: track(woodTexture('#734829', '#3d2410')),
    normalMap: woodNormal,
    ...(nrm ? { normalScale: nrm } : {}),
    roughness: 0.34,
    metalness: 0.16,
    envMapIntensity: 0.8,
  })

  // ── table ───────────────────────────────────────────────────────────────────
  const table = new THREE.Group()
  scene.add(table)
  const add = (parent, geo, mat, x, y, z, opts = {}) => {
    const m = new THREE.Mesh(track(geo), mat)
    m.position.set(x, y, z)
    if (opts.ry) m.rotation.y = opts.ry
    if (opts.rx) m.rotation.x = opts.rx
    if (!lowEnd && opts.shadow !== false) {
      m.castShadow = opts.cast !== false
      m.receiveShadow = true
    }
    parent.add(m)
    return m
  }

  // cloth bed (extends under the cushions)
  add(
    table,
    new THREE.BoxGeometry(TABLE.W + CUSHION_W * 2, 0.02, TABLE.H + CUSHION_W * 2),
    feltMat,
    0,
    CLOTH_Y - 0.01,
    0,
    { cast: false },
  )

  // cushions: 6 segments leaving the pocket mouths open
  const cushY = CLOTH_Y + 0.024
  const cushH = 0.05
  const gapC = 0.09 // corner mouth clearance
  const gapS = 0.075 // side mouth clearance
  const longSeg = HW - gapC - gapS
  for (const sz of [-1, 1]) {
    for (const half of [-1, 1]) {
      const cx = half * (gapS + longSeg / 2)
      add(
        table,
        new THREE.BoxGeometry(longSeg, cushH, CUSHION_W),
        feltMat,
        cx,
        cushY,
        sz * (HH + CUSHION_W / 2),
      )
    }
    add(
      table,
      new THREE.BoxGeometry(CUSHION_W, cushH, TABLE.H - gapC * 2),
      feltMat,
      sz * (HW + CUSHION_W / 2),
      cushY,
      0,
    )
  }

  // two-tier walnut rails: a wood body + a lighter polished CAP on top (the
  // layered Gold Crown look). Sights live on the cap.
  const railY = CLOTH_Y + 0.035
  const railH = 0.075
  const capH = 0.016
  const capY = railY + railH / 2 + capH / 2
  const capTop = railY + railH / 2 + capH
  const outW = HW + CUSHION_W + RAIL_W
  const outH = HH + CUSHION_W + RAIL_W
  const railLongLen = outW * 2 + RAIL_W
  const railShortLen = outH * 2 - RAIL_W
  const longZ = HH + CUSHION_W + RAIL_W / 2
  const shortX = HW + CUSHION_W + RAIL_W / 2
  // bodies
  add(table, new THREE.BoxGeometry(railLongLen, railH, RAIL_W), woodMat, 0, railY, -longZ)
  add(table, new THREE.BoxGeometry(railLongLen, railH, RAIL_W), woodMat, 0, railY, longZ)
  add(table, new THREE.BoxGeometry(RAIL_W, railH, railShortLen), woodMat, -shortX, railY, 0)
  add(table, new THREE.BoxGeometry(RAIL_W, railH, railShortLen), woodMat, shortX, railY, 0)
  // caps (slightly inset so the body edge shows below → a real bevel/step)
  const capInset = 0.018
  add(table, new THREE.BoxGeometry(railLongLen - capInset, capH, RAIL_W - capInset), capMat, 0, capY, -longZ, { cast: false }) // prettier-ignore
  add(table, new THREE.BoxGeometry(railLongLen - capInset, capH, RAIL_W - capInset), capMat, 0, capY, longZ, { cast: false }) // prettier-ignore
  add(table, new THREE.BoxGeometry(RAIL_W - capInset, capH, railShortLen - capInset), capMat, -shortX, capY, 0, { cast: false }) // prettier-ignore
  add(table, new THREE.BoxGeometry(RAIL_W - capInset, capH, railShortLen - capInset), capMat, shortX, capY, 0, { cast: false }) // prettier-ignore
  // the Gold Crown's signature: chrome DIAMOND sights (a flat box turned 45°),
  // not round pearl dots — inlaid into the polished cap top
  const sightGeo = track(new THREE.BoxGeometry(0.017, 0.006, 0.017))
  const sightMat = chromeMat
  for (let i = 1; i <= 3; i++) {
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s1 = new THREE.Mesh(sightGeo, sightMat)
        s1.position.set(sx * (HW / 4) * i, capTop + 0.001, sz * longZ)
        s1.rotation.y = Math.PI / 4
        table.add(s1)
      }
    }
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        const s2 = new THREE.Mesh(sightGeo, sightMat)
        s2.position.set(
          sx * shortX,
          capTop + 0.001,
          sz * (HH / 2) * (i / 1.5 > 1 ? 0.999 : i / 1.5),
        )
        s2.rotation.y = Math.PI / 4
        if (i <= 2) table.add(s2)
      }
    }
  }
  // ── pockets: clean holes FLUSH with the felt ─────────────────────────────
  // Nothing rises above the bed. A thin flat leather jaw + a flat dark mouth
  // disc (its radial gradient fakes the drop). Pushed slightly OUTWARD so the
  // mouth reads as cut into the corner/side, not a coin lying on the cloth.
  const pocketMouthMat = std({ map: track(pocketMouthTexture()), roughness: 1, metalness: 0 })
  const pocketLeather = std({ color: 0x241610, roughness: 0.82, metalness: 0.05 })
  for (const p of POCKETS) {
    const corner = p.x !== 0
    const off = corner ? 0.03 : 0.026
    const px = p.x + Math.sign(p.x) * off
    const pz = p.z + Math.sign(p.z) * off
    const r = corner ? 0.08 : 0.068
    // flat leather jaw, flush (frames the mouth — never a raised ring)
    add(table, new THREE.RingGeometry(r * 0.94, r + 0.012, 30), pocketLeather, px, CLOTH_Y + 0.0016, pz, { rx: -Math.PI / 2, shadow: false, cast: false }) // prettier-ignore
    // flat dark mouth disc, flush (the baked gradient reads as a drop pocket)
    add(table, new THREE.CircleGeometry(r, 30), pocketMouthMat, px, CLOTH_Y + 0.003, pz, { rx: -Math.PI / 2, shadow: false, cast: false }) // prettier-ignore
  }

  // apron (Gold Crown body) + chrome trim line + legs
  add(
    table,
    new THREE.BoxGeometry(outW * 2 + RAIL_W, 0.16, outH * 2 + RAIL_W),
    darkWoodMat,
    0,
    CLOTH_Y - 0.105,
    0,
  )
  add(
    table,
    new THREE.BoxGeometry(outW * 2 + RAIL_W + 0.006, 0.012, outH * 2 + RAIL_W + 0.006),
    chromeMat,
    0,
    CLOTH_Y - 0.03,
    0,
    { cast: false },
  )
  const legGeo = track(new THREE.BoxGeometry(0.16, CLOTH_Y - 0.18, 0.16))
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      add(table, legGeo, darkWoodMat, sx * (outW - 0.2), (CLOTH_Y - 0.18) / 2, sz * (outH - 0.16))
    }
  }

  // ── the bar around it ───────────────────────────────────────────────────────
  const room = new THREE.Group()
  scene.add(room)
  const floor = new THREE.Mesh(
    track(new THREE.PlaneGeometry(16, 14)),
    std({
      map: track(floorPlankTexture()),
      roughness: 0.62,
      metalness: 0.04,
      envMapIntensity: 0.35,
    }),
  )
  floor.rotation.x = -Math.PI / 2
  if (!lowEnd) floor.receiveShadow = true
  const ft = floor.material.map
  if (ft) {
    ft.wrapS = THREE.RepeatWrapping
    ft.wrapT = THREE.RepeatWrapping
    ft.repeat?.set?.(5, 4.5)
  }
  room.add(floor)

  const wallMat = std({ color: 0x6d4a35, roughness: 0.95 })
  const wainscotMat = std({ map: track(woodTexture('#3f2716', '#281505')), roughness: 0.8 })
  const wall = (w, x, z, ry) => {
    add(room, new THREE.PlaneGeometry(w, 3.2), wallMat, x, 1.6, z, { ry, cast: false })
    add(
      room,
      new THREE.BoxGeometry(w, 1.0, 0.04),
      wainscotMat,
      x + (ry ? Math.cos(ry) * 0.02 : 0),
      0.5,
      z + (ry ? Math.sin(Math.abs(ry)) * 0.02 * Math.sign(-z || 1) : 0.02),
      { ry, cast: false },
    )
  }
  wall(14, 0, -5.4, 0)
  wall(12, -6.6, 0, Math.PI / 2)
  wall(12, 6.6, 0, -Math.PI / 2)

  // pictures on the back wall
  const frame = (x, a, b) => {
    add(room, new THREE.BoxGeometry(0.62, 0.47, 0.03), darkWoodMat, x, 1.9, -5.37, { cast: false })
    add(
      room,
      new THREE.PlaneGeometry(0.52, 0.37),
      std({ map: track(artTexture(a, b)), roughness: 0.9 }),
      x,
      1.9,
      -5.35,
      { cast: false },
    )
  }
  frame(-2.2, '#b46a3a', '#3a2a55')
  frame(0.6, '#2c6f5c', '#0e2233')
  frame(3.1, '#8a3a4a', '#2c1020')

  // bar counter + stools + bottles (back-left)
  const counter = new THREE.Group()
  counter.position.set(-3.4, 0, -3.9)
  room.add(counter)
  add(counter, new THREE.BoxGeometry(4.6, 1.05, 0.7), darkWoodMat, 0, 0.525, 0)
  add(counter, new THREE.BoxGeometry(4.9, 0.07, 0.9), woodMat, 0, 1.09, 0)
  add(counter, new THREE.BoxGeometry(4.6, 1.5, 0.25), wainscotMat, 0, 1.9, -0.75, { cast: false })
  const bottleMat = [
    std({ color: 0x7fae5a, roughness: 0.2, metalness: 0.1 }),
    std({ color: 0xb06a2c, roughness: 0.2 }),
    std({ color: 0x4a7fae, roughness: 0.2 }),
  ]
  for (let i = 0; i < 8; i++) {
    add(
      counter,
      new THREE.CylinderGeometry(0.035, 0.04, 0.26, 8),
      bottleMat[i % 3],
      -1.9 + i * 0.52,
      1.35,
      -0.68,
      { shadow: false },
    )
  }
  const stoolTop = std({ color: 0x8c2f2f, roughness: 0.6 })
  for (let i = 0; i < 3; i++) {
    const sx = -1.5 + i * 1.5
    add(counter, new THREE.CylinderGeometry(0.19, 0.19, 0.06, 14), stoolTop, sx, 0.72, 0.62)
    add(counter, new THREE.CylinderGeometry(0.03, 0.05, 0.7, 8), chromeMat, sx, 0.36, 0.62)
  }

  // hanging lamps over the table
  for (const lx of [-0.62, 0.62]) {
    add(room, new THREE.CylinderGeometry(0.012, 0.012, 0.9, 6), chromeMat, lx, 2.75, 0, {
      shadow: false,
    })
    add(
      room,
      new THREE.CylinderGeometry(0.05, 0.24, 0.2, 16, 1, true),
      std({ color: 0x1d4a3a, roughness: 0.5, metalness: 0.3, side: THREE.DoubleSide }),
      lx,
      2.3,
      0,
      { shadow: false },
    )
    const bulb = new THREE.Mesh(
      track(new THREE.SphereGeometry(0.035, 10, 8)),
      track(new THREE.MeshBasicMaterial({ color: 0xffe9b8 })),
    )
    bulb.position.set(lx, 2.26, 0)
    room.add(bulb)
  }

  // ── balls ───────────────────────────────────────────────────────────────────
  const ballGeo = track(new THREE.SphereGeometry(BALL_R, lowEnd ? 18 : 28, lowEnd ? 14 : 20))
  const ballMeshes = new Map()
  const mkBallMat = (n) => {
    const map = track(ballTexture(n))
    if (lowEnd) return std({ map, roughness: 0.2, metalness: 0, envMapIntensity: 0.8 })
    return track(
      new THREE.MeshPhysicalMaterial({
        map,
        roughness: 0.045, // polished phenolic resin — sharp reflections
        metalness: 0,
        clearcoat: 1,
        clearcoatRoughness: 0.06,
        envMapIntensity: 1.15, // reflect the bar + its lamps
      }),
    )
  }
  for (let n = 0; n <= 15; n++) {
    const m = new THREE.Mesh(ballGeo, mkBallMat(n))
    m.position.y = CLOTH_Y + BALL_R
    if (!lowEnd) m.castShadow = true
    m.visible = false
    scene.add(m)
    ballMeshes.set(n, m)
  }
  const prevPos = new Map()

  // ── cue stick ───────────────────────────────────────────────────────────────
  // Outer group spins in Y to aim + translates for the pull-back/lunge; an inner
  // group holds a fixed BUTT-UP tilt so the stick rises away from the cloth and
  // never grazes through a rail/apron when the cue ball sits near a cushion.
  const cueGroup = new THREE.Group()
  const cueTilt = new THREE.Group()
  cueTilt.rotation.z = -0.12 // butt end lifts ~7° off the bed
  cueGroup.add(cueTilt)
  const shaft = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.007, 0.013, 1.45, 12)),
    std({ map: track(woodTexture('#a4713d', '#5c3a1a')), roughness: 0.45 }),
  )
  shaft.rotation.z = Math.PI / 2
  shaft.position.x = -(1.45 / 2 + 0.02)
  cueTilt.add(shaft)
  const tip = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.0068, 0.0068, 0.012, 10)),
    std({ color: 0x3d6fd8, roughness: 0.8 }),
  )
  tip.rotation.z = Math.PI / 2
  tip.position.x = -0.02
  cueTilt.add(tip)
  const butt = new THREE.Mesh(
    track(new THREE.CylinderGeometry(0.0145, 0.016, 0.3, 12)),
    darkWoodMat,
  )
  butt.rotation.z = Math.PI / 2
  butt.position.x = -(1.45 + 0.02 + 0.14)
  cueTilt.add(butt)
  cueGroup.visible = false
  scene.add(cueGroup)

  // ── aim guide: cue line, ghost ball, target arrow ───────────────────────────
  const aimMat = track(
    new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.75 }),
  )
  const mkLine = () => {
    const g = track(new THREE.BufferGeometry())
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3))
    const l = new THREE.Line(g, aimMat)
    l.visible = false
    scene.add(l)
    return l
  }
  const aimLine = mkLine()
  const targetLine = mkLine()
  const ghost = new THREE.Mesh(
    track(new THREE.SphereGeometry(BALL_R, 14, 10)),
    track(
      new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0.16, // faint outline — a solid ghost reads as an extra ball
        depthWrite: false,
      }),
    ),
  )
  ghost.visible = false
  scene.add(ghost)
  // ball-in-hand marker ring
  const marker = new THREE.Mesh(
    track(new THREE.TorusGeometry(BALL_R * 1.5, 0.004, 8, 24)),
    track(new THREE.MeshBasicMaterial({ color: 0x7fd4ff, transparent: true, opacity: 0.9 })),
  )
  marker.rotation.x = Math.PI / 2
  marker.visible = false
  scene.add(marker)

  const setLine = (line, x1, z1, x2, z2, y = CLOTH_Y + BALL_R) => {
    const a = line.geometry.attributes.position
    a.setXYZ(0, x1, y, z1)
    a.setXYZ(1, x2, y, z2)
    a.needsUpdate = true
    line.visible = true
  }

  // ── camera pose smoothing ───────────────────────────────────────────────────
  const camTarget = { x: 0, y: 2.2, z: 2.6, lx: 0, ly: CLOTH_Y, lz: 0 }
  const camNow = { ...camTarget }
  const look = new THREE.Vector3()

  // ── strike animation state ──────────────────────────────────────────────────
  let cueAnim = null // { t } lunge after the pull-back

  const raycaster = new THREE.Raycaster()
  const tablePlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -(CLOTH_Y + BALL_R))
  const ndc = new THREE.Vector2()
  const hit = new THREE.Vector3()

  const api = {
    ok: true,

    /** Mirror engine balls; visually roll them by their frame displacement. */
    syncBalls(balls) {
      for (const b of balls) {
        const m = ballMeshes.get(b.n)
        if (!m) continue
        m.visible = !b.pocketed
        if (b.pocketed) {
          prevPos.delete(b.n)
          continue
        }
        m.position.set(b.x, CLOTH_Y + BALL_R, b.z)
        const p = prevPos.get(b.n)
        if (p) {
          const dx = b.x - p.x
          const dz = b.z - p.z
          const d = Math.hypot(dx, dz)
          if (d > 1e-6) {
            const axis = new THREE.Vector3(dz / d, 0, -dx / d)
            m.rotateOnWorldAxis?.(axis, d / BALL_R)
          }
        }
        prevPos.set(b.n, { x: b.x, z: b.z })
      }
    },

    /**
     * The aiming rig. aim = { visible, cue:{x,z}, angle, power, contact?:
     * {x,z}, target?:{x,z,dirX,dirZ} }. Ghost + arrow only when a contact is
     * predicted; the cue pulls back with power.
     */
    setAim(aim) {
      if (!aim || !aim.visible) {
        aimLine.visible = false
        targetLine.visible = false
        ghost.visible = false
        cueGroup.visible = false
        return
      }
      const { cue, angle, power = 0.5 } = aim
      const cx = aim.contact ? aim.contact.x : cue.x + Math.cos(angle) * 1.2
      const cz = aim.contact ? aim.contact.z : cue.z + Math.sin(angle) * 1.2
      setLine(aimLine, cue.x, cue.z, cx, cz)
      if (aim.contact) {
        ghost.position.set(aim.contact.x, CLOTH_Y + BALL_R, aim.contact.z)
        ghost.visible = true
      } else ghost.visible = false
      if (aim.target) {
        setLine(
          targetLine,
          aim.target.x,
          aim.target.z,
          aim.target.x + aim.target.dirX * 0.34,
          aim.target.z + aim.target.dirZ * 0.34,
        )
      } else targetLine.visible = false
      // cue stick behind the ball, pulled back with power
      if (!cueAnim) {
        cueGroup.visible = true
        cueGroup.position.set(cue.x, CLOTH_Y + BALL_R, cue.z)
        cueGroup.rotation.y = -angle
        const pull = 0.05 + power * 0.16
        cueGroup.position.x -= Math.cos(angle) * pull
        cueGroup.position.z -= Math.sin(angle) * pull
        cueGroup.position.y += 0.012 // slight elevation like a real stance
      }
    },

    /** Lunge the stick into the ball, then hide it (ball motion takes over). */
    strikeCue() {
      cueAnim = { t: 0 }
    },

    setMarker(pos) {
      if (!pos) {
        marker.visible = false
        return
      }
      marker.position.set(pos.x, CLOTH_Y + 0.004, pos.z)
      marker.visible = true
    },

    /** Smooth camera: pose = {x,y,z, lx,ly,lz} in world meters. */
    setCameraPose(pose) {
      Object.assign(camTarget, pose)
    },

    /** Unproject a pointer event to the ball plane → {x,z} or null. */
    screenToTable(clientX, clientY) {
      const r = canvas.getBoundingClientRect()
      ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1)
      raycaster.setFromCamera(ndc, camera)
      const p = raycaster.ray.intersectPlane(tablePlane, hit)
      return p ? { x: p.x, z: p.z } : null
    },

    resize() {
      const w = canvas.clientWidth || 640
      const h = canvas.clientHeight || 480
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      renderer.setSize(w, h, false)
    },

    render(dt = 1 / 60) {
      // camera easing
      const k = Math.min(1, dt * 5)
      for (const key of ['x', 'y', 'z', 'lx', 'ly', 'lz']) {
        camNow[key] += (camTarget[key] - camNow[key]) * k
      }
      camera.position.set(camNow.x, camNow.y, camNow.z)
      look.set(camNow.lx, camNow.ly, camNow.lz)
      camera.lookAt(look)
      // cue lunge
      if (cueAnim) {
        cueAnim.t += dt * 9
        const f = Math.min(1, cueAnim.t)
        cueGroup.position.x += Math.cos(-cueGroup.rotation.y) * 0.028 * dt * 60 * (1 - f * 0.4)
        cueGroup.position.z += Math.sin(-cueGroup.rotation.y) * 0.028 * dt * 60 * (1 - f * 0.4)
        if (f >= 1) {
          cueAnim = null
          cueGroup.visible = false
        }
      }
      renderer.render(scene, camera)
    },

    dispose() {
      for (const d of disposables) {
        try {
          d.dispose?.()
        } catch {
          /* best-effort */
        }
      }
      try {
        renderer.dispose()
      } catch {
        /* best-effort */
      }
    },
  }

  api.resize()
  return api
}
