// Um three de mentira para o teste. O jsdom não tem WebGL: o WebGLRenderer de
// verdade lança ao criar o contexto, e a cena não nasce. Este dublê é o
// `tests/setup/threeStub.js` do RoqueOS (o que os testes da Sinuca usavam lá, até
// 25/09/2026), recortado ao que a cena da Sinuca toca, com as peças que o
// `scene3d.spec.js` de lá acrescentava só para ele: `SpotLight`, `PMREMGenerator`,
// `BufferAttribute.setXYZ` e as três constantes de cor e tom. Aqui elas ficam no
// dublê, porque o teste do componente agora também constrói a cena inteira.
//
// Por que a cena inteira no teste do componente: no RoqueOS o `vi.mock` dele não
// tinha `SpotLight` nem `ACESFilmicToneMapping`, a cena caía no "não faz nada"
// e o teste nunca via o que o jogo pedia à GPU. Aqui o renderer guarda as opções
// com que nasceu, o pixel ratio, se o mapa de sombra ligou e se foi descartado, e
// se pendura no canvas que o jogo entregou (`canvas.__renderizador`). É assim que
// o teste confere que o modo leve do host chega no código de GPU sem abrir o
// componente por dentro.
//
// O mock de módulo do Vitest é ESTRITO: ler um export que o dublê não tem lança.
// A cena testa `THREE.ACESFilmicToneMapping !== undefined` e cia., então essas
// constantes precisam existir aqui, mesmo que valham qualquer coisa.
//
// Uso: vi.mock('three', async () => (await import('./threeStub.js')).criarThreeFalso())
export function criarThreeFalso() {
  class Vec3 {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x
      this.y = y
      this.z = z
    }
    set(x, y, z) {
      this.x = x
      this.y = y
      this.z = z
      return this
    }
  }
  class Vec2 {
    constructor(x = 0, y = 0) {
      this.x = x
      this.y = y
    }
    set(x, y) {
      this.x = x
      this.y = y
      return this
    }
  }
  class Color {
    constructor(hex = 0xffffff) {
      this.hex = hex
    }
  }
  class Object3D {
    constructor() {
      this.children = []
      this.position = new Vec3()
      this.scale = new Vec3(1, 1, 1)
      this.rotation = new Vec3()
      this.visible = true
      this.castShadow = false
      this.receiveShadow = false
    }
    add(...filhos) {
      this.children.push(...filhos)
    }
    remove(x) {
      this.children = this.children.filter((c) => c !== x)
    }
  }
  class Mesh extends Object3D {
    constructor(geometry, material) {
      super()
      this.geometry = geometry
      this.material = material
    }
  }
  class Attr {
    constructor(array, itemSize) {
      this.array = array
      this.itemSize = itemSize
      this.needsUpdate = false
    }
    // As linhas da mira escrevem os dois vértices por aqui.
    setXYZ(i, x, y, z) {
      const o = i * (this.itemSize || 3)
      this.array[o] = x
      this.array[o + 1] = y
      this.array[o + 2] = z
      return this
    }
  }
  class Geometry {
    constructor() {
      this.attributes = {}
    }
    setAttribute(nome, attr) {
      this.attributes[nome] = attr
      return this
    }
    dispose() {}
  }
  class Material {
    constructor(opcoes = {}) {
      Object.assign(this, opcoes)
      this.opacity = opcoes.opacity ?? 1
    }
    dispose() {}
  }
  class Camera extends Object3D {
    constructor(fov, aspect) {
      super()
      this.fov = fov
      this.aspect = aspect
    }
    updateProjectionMatrix() {}
    lookAt() {}
  }
  class ShadowLight extends Object3D {
    constructor() {
      super()
      this.shadow = { mapSize: new Vec2(), bias: 0 }
    }
  }
  // O foco de bilhar sobre a mesa.
  class SpotLight extends ShadowLight {
    constructor() {
      super()
      this.target = new Object3D()
    }
  }
  class CanvasTexture {
    constructor(imagem) {
      this.image = imagem
      this.wrapS = 0
      this.wrapT = 0
      this.colorSpace = 'srgb'
      this.repeat = new Vec2()
    }
    dispose() {}
  }
  // A iluminação por ambiente (IBL): o ramo dela roda de verdade.
  class PMREMGenerator {
    fromEquirectangular() {
      return { texture: { dispose() {} } }
    }
    dispose() {}
  }
  class Raycaster {
    constructor() {
      this.ray = {
        // Determinístico: qualquer toque cai no mesmo ponto do plano.
        intersectPlane(_plano, alvo) {
          alvo.set(2, 0, 1)
          return alvo
        },
      }
    }
    setFromCamera() {}
  }
  class WebGLRenderer {
    constructor(opcoes = {}) {
      this.opcoes = { ...opcoes }
      delete this.opcoes.canvas
      this.pixelRatio = 1
      this.descartado = false
      this.shadowMap = { enabled: false, type: 0 }
      // Como no dublê do RoqueOS, o renderer cria um canvas ao nascer: é essa
      // chamada que o caso "cena que não nasce" quebra de propósito.
      this.domElement = document.createElement('canvas')
      if (opcoes.canvas) opcoes.canvas.__renderizador = this
    }
    setPixelRatio(r) {
      this.pixelRatio = r
    }
    setSize() {}
    render() {}
    dispose() {
      this.descartado = true
    }
  }
  const Line = class extends Object3D {
    constructor(geometry, material) {
      super()
      this.geometry = geometry
      this.material = material
    }
  }
  return {
    Scene: Object3D,
    Group: Object3D,
    Mesh,
    Line,
    BufferGeometry: Geometry,
    BufferAttribute: Attr,
    BoxGeometry: class extends Geometry {},
    PlaneGeometry: class extends Geometry {},
    SphereGeometry: class extends Geometry {},
    CylinderGeometry: class extends Geometry {},
    RingGeometry: class extends Geometry {},
    CircleGeometry: class extends Geometry {},
    TorusGeometry: class extends Geometry {},
    MeshStandardMaterial: class extends Material {},
    MeshPhysicalMaterial: class extends Material {},
    MeshBasicMaterial: class extends Material {},
    LineBasicMaterial: class extends Material {},
    CanvasTexture,
    PMREMGenerator,
    HemisphereLight: class extends Object3D {},
    SpotLight,
    PointLight: class extends Object3D {},
    Fog: class {},
    PerspectiveCamera: Camera,
    Color,
    Vector2: Vec2,
    Vector3: Vec3,
    Plane: class {},
    Raycaster,
    WebGLRenderer,
    PCFSoftShadowMap: 2,
    ACESFilmicToneMapping: 1,
    SRGBColorSpace: 'srgb',
    NoColorSpace: 'no-color-space',
    EquirectangularReflectionMapping: 301,
    RepeatWrapping: 1000,
    DoubleSide: 2,
  }
}
