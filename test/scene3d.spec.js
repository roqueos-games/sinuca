import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// O scene3d.js é o módulo de RENDER. O `three` vira o dublê para o buildScene()
// chegar ao fim (ok: true) e o teste exercitar a construção de verdade de
// textura, geometria e material e a API inteira de render, e não só o "não faz
// nada". No RoqueOS o dublê comum era estendido aqui dentro com SpotLight,
// PMREMGenerator, BufferAttribute.setXYZ e as constantes de tom e cor; na
// extração essas peças foram para o próprio `threeStub.js`, que o teste do
// componente também usa. Os sete casos de lá seguem abaixo, sem mudança.
vi.mock('three', async () => (await import('./threeStub.js')).criarThreeFalso())

import { createPoolScene, CLOTH_Y, BALL_COLORS } from '../src/scene3d.js'

// permissive recursive canvas-2D stub (house pattern) so the procedural
// textures draw without a real 2D context
const make2dStub = () => {
  const stub = new Proxy(function () {}, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => 0 : stub),
    set: () => true,
    apply: () => stub,
  })
  return stub
}

const rect = { left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480 }

describe('pool scene3d', () => {
  let origGetContext
  let origRect
  let canvas

  beforeEach(() => {
    origGetContext = HTMLCanvasElement.prototype.getContext
    origRect = Element.prototype.getBoundingClientRect
    HTMLCanvasElement.prototype.getContext = vi.fn(() => make2dStub())
    Element.prototype.getBoundingClientRect = vi.fn(() => rect)
    canvas = document.createElement('canvas')
  })
  afterEach(() => {
    HTMLCanvasElement.prototype.getContext = origGetContext
    Element.prototype.getBoundingClientRect = origRect
    vi.restoreAllMocks()
  })

  it('exports the 16 ball colours and the bed height', () => {
    expect(BALL_COLORS).toHaveLength(16)
    expect(BALL_COLORS[0]).toBe('#f6f1e7') // cue
    expect(CLOTH_Y).toBe(0.8)
  })

  it('builds a live scene (ok) with the full render API', () => {
    const api = createPoolScene({ canvas })
    expect(api.ok).toBe(true)
    for (const m of [
      'syncBalls',
      'setAim',
      'strikeCue',
      'setCameraPose',
      'screenToTable',
      'setMarker',
      'resize',
      'render',
      'dispose',
    ]) {
      expect(typeof api[m]).toBe('function')
    }
    api.dispose()
  })

  it('builds in low-end mode too (no shadows/antialias path)', () => {
    const api = createPoolScene({ canvas, lowEnd: true })
    expect(api.ok).toBe(true)
    api.dispose()
  })

  it('syncs balls: hides pocketed, shows and rolls the rest without throwing', () => {
    const api = createPoolScene({ canvas })
    expect(() => {
      // first frame seeds prevPos
      api.syncBalls([
        { n: 0, x: 0, z: 0, pocketed: false },
        { n: 1, x: 0.1, z: 0.05, pocketed: false },
        { n: 8, x: 0.2, z: 0, pocketed: true },
      ])
      // second frame exercises the visual-roll (displacement) path
      api.syncBalls([
        { n: 0, x: 0.05, z: 0.02, pocketed: false },
        { n: 1, x: 0.1, z: 0.05, pocketed: false },
        { n: 8, x: 0.2, z: 0, pocketed: true },
      ])
    }).not.toThrow()
  })

  it('drives the aim rig (with and without a predicted contact) and the cue lunge', () => {
    const api = createPoolScene({ canvas })
    expect(() => {
      api.setAim({ visible: false })
      api.setAim({
        visible: true,
        cue: { x: 0, z: 0 },
        angle: 0.6,
        power: 0.8,
        contact: { x: 0.3, z: 0.2 },
        target: { x: 0.3, z: 0.2, dirX: 1, dirZ: 0 },
      })
      api.setAim({ visible: true, cue: { x: 0, z: 0 }, angle: 0.6 }) // no contact
      api.strikeCue()
      for (let i = 0; i < 40; i++) api.render(1 / 60) // run the lunge to completion
    }).not.toThrow()
  })

  it('moves the camera, the ball-in-hand marker, and unprojects a pointer to the bed', () => {
    const api = createPoolScene({ canvas })
    api.setCameraPose({ x: 0, y: 2, z: 2, lx: 0, ly: CLOTH_Y, lz: 0 })
    api.setMarker({ x: 0.1, z: 0.1 })
    api.setMarker(null)
    api.resize()
    const p = api.screenToTable(120, 90)
    expect(p).not.toBeNull()
    expect(typeof p.x).toBe('number')
    expect(typeof p.z).toBe('number')
  })

  it('degrades to a no-op API (never throws) when the scene cannot be built', () => {
    // Force construction to fail: the WebGLRenderer stub makes a canvas in its
    // constructor — break that and buildScene throws → the safe no-op is returned.
    const realCreate = document.createElement.bind(document)
    const spy = vi.spyOn(document, 'createElement').mockImplementation((tag) => {
      if (tag === 'canvas') throw new Error('no webgl')
      return realCreate(tag)
    })
    try {
      const api = createPoolScene({ canvas })
      expect(api.ok).toBe(false)
      expect(api.screenToTable(0, 0)).toBeNull()
      expect(() => {
        api.syncBalls([{ n: 0, x: 0, z: 0, pocketed: false }])
        api.setAim({ visible: true, cue: { x: 0, z: 0 }, angle: 0 })
        api.strikeCue()
        api.setCameraPose({ x: 0, y: 1, z: 1 })
        api.setMarker(null)
        api.resize()
        api.render()
        api.dispose()
      }).not.toThrow()
    } finally {
      spy.mockRestore()
    }
  })
})
