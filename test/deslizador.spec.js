// O deslizador de força, sozinho. Ele substitui o `ROSRangeSlider` do RoqueOS,
// que a Sinuca usava até 25/09/2026, e este teste prende o comportamento que
// a Sinuca usa de lá: toque que pula e arrasta, captura do ponteiro, teclado
// com foco, limites e passo. Montado com a configuração da Sinuca (5 a 100,
// passo 1) e uma faixa de 200 px que começa em x = 0.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { createApp, h, nextTick, ref } from 'vue'
import Deslizador from '../src/Deslizador.vue'

const FAIXA = { left: 0, top: 0, width: 200, height: 28, right: 200, bottom: 28, x: 0, y: 0 }

let el = null
let app = null
let valor = null
let leve = null

const montar = ({ inicial = 55, comLeve = false } = {}) => {
  valor = ref(inicial)
  leve = ref(comLeve)
  el = document.createElement('div')
  document.body.appendChild(el)
  app = createApp({
    render: () =>
      h(Deslizador, {
        modelValue: valor.value,
        'onUpdate:modelValue': (v) => (valor.value = v),
        min: 5,
        max: 100,
        step: 1,
        ariaLabel: 'Força',
        leve: leve.value,
      }),
  })
  app.mount(el)
  return el.querySelector('.ros-range')
}
// Evento de ponteiro "cru": o jsdom não tem PointerEvent.
const ponteiro = (alvo, tipo, x, extra = {}) => {
  const ev = new Event(tipo, { bubbles: true, cancelable: true })
  Object.assign(ev, {
    clientX: x,
    clientY: 10,
    pointerId: 7,
    pointerType: 'touch',
    button: 0,
    ...extra,
  })
  alvo.dispatchEvent(ev)
  return ev
}
const tecla = (alvo, key) => {
  const ev = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true })
  alvo.dispatchEvent(ev)
  return ev
}

describe('Deslizador', () => {
  beforeEach(() => {
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(FAIXA)
  })
  afterEach(() => {
    app?.unmount()
    el?.remove()
    app = null
    el = null
    vi.restoreAllMocks()
  })

  it('é um slider acessível: papel, limites, valor, rótulo e foco de teclado', () => {
    const d = montar()
    expect(d.getAttribute('role')).toBe('slider')
    expect(d.getAttribute('aria-valuemin')).toBe('5')
    expect(d.getAttribute('aria-valuemax')).toBe('100')
    expect(d.getAttribute('aria-valuenow')).toBe('55')
    expect(d.getAttribute('aria-label')).toBe('Força')
    expect(d.getAttribute('tabindex')).toBe('0')
    // 55 entre 5 e 100 é 52,63% da faixa.
    expect(d.style.getPropertyValue('--ros-range-fill')).toMatch(/^52\.63/)
  })

  it('um toque em qualquer ponto da faixa pula o valor para ali e começa o arrasto', async () => {
    const d = montar()
    d.setPointerCapture = vi.fn()
    d.hasPointerCapture = vi.fn(() => true)
    d.releasePointerCapture = vi.fn()
    const toque = ponteiro(d, 'pointerdown', 40) // 20% da faixa: 5 + 0,2 × 95 = 24
    expect(toque.defaultPrevented).toBe(true)
    expect(valor.value).toBe(24)
    expect(d.setPointerCapture).toHaveBeenCalledWith(7)
    await nextTick()
    expect(d.classList.contains('ros-range--pressed')).toBe(true)
    expect(d.querySelector('.ros-range__bubble').textContent).toBe('24')

    ponteiro(d, 'pointermove', 200) // o fim da faixa
    expect(valor.value).toBe(100)
    ponteiro(d, 'pointermove', 500) // passou da faixa: fica no máximo
    expect(valor.value).toBe(100)
    ponteiro(d, 'pointermove', -30) // passou do começo: fica no mínimo
    expect(valor.value).toBe(5)

    ponteiro(d, 'pointerup', -30)
    expect(d.releasePointerCapture).toHaveBeenCalledWith(7)
    await nextTick()
    expect(d.classList.contains('ros-range--pressed')).toBe(false)
    // Solto, mexer o ponteiro não muda mais nada.
    ponteiro(d, 'pointermove', 120)
    expect(valor.value).toBe(5)
  })

  it('arredonda para o passo: meio da faixa em 5..100 vira 53', () => {
    const d = montar()
    ponteiro(d, 'pointerdown', 100) // 5 + 0,5 × 95 = 52,5 → 53
    expect(valor.value).toBe(53)
  })

  it('sem setPointerCapture (navegador antigo) o arrasto funciona igual', () => {
    const d = montar()
    d.setPointerCapture = () => {
      throw new Error('não suportado')
    }
    ponteiro(d, 'pointerdown', 40)
    ponteiro(d, 'pointermove', 100)
    expect(valor.value).toBe(53)
  })

  it('pointercancel (o sistema tomou o gesto) encerra o arrasto', async () => {
    const d = montar()
    ponteiro(d, 'pointerdown', 40)
    ponteiro(d, 'pointercancel', 40)
    ponteiro(d, 'pointermove', 180)
    expect(valor.value).toBe(24)
  })

  it('mouse só com o botão principal; o direito não mexe', () => {
    const d = montar()
    ponteiro(d, 'pointerdown', 40, { pointerType: 'mouse', button: 2 })
    expect(valor.value).toBe(55)
    ponteiro(d, 'pointerdown', 40, { pointerType: 'mouse', button: 0 })
    expect(valor.value).toBe(24)
  })

  it('teclado: setas andam um passo, PageUp/PageDown dez, Home/End aos extremos', async () => {
    const d = montar()
    tecla(d, 'ArrowRight')
    expect(valor.value).toBe(56)
    await nextTick()
    tecla(d, 'ArrowUp')
    expect(valor.value).toBe(57)
    await nextTick()
    tecla(d, 'ArrowLeft')
    await nextTick()
    tecla(d, 'ArrowDown')
    expect(valor.value).toBe(55)
    await nextTick()
    tecla(d, 'PageUp')
    expect(valor.value).toBe(65)
    await nextTick()
    tecla(d, 'PageDown')
    expect(valor.value).toBe(55)
    await nextTick()
    expect(tecla(d, 'End').defaultPrevented).toBe(true)
    expect(valor.value).toBe(100)
    await nextTick()
    tecla(d, 'ArrowRight') // já no máximo: fica
    expect(valor.value).toBe(100)
    await nextTick()
    tecla(d, 'Home')
    expect(valor.value).toBe(5)
    await nextTick()
    tecla(d, 'PageDown') // já no mínimo: fica
    expect(valor.value).toBe(5)
  })

  it('tecla que não é do deslizador passa adiante, sem preventDefault', () => {
    const d = montar()
    const ev = tecla(d, 'Enter')
    expect(ev.defaultPrevented).toBe(false)
    expect(valor.value).toBe(55)
  })

  it('o valor que muda de fora (a força volta a 55 a cada partida) move a faixa', async () => {
    const d = montar({ inicial: 100 })
    expect(d.getAttribute('aria-valuenow')).toBe('100')
    valor.value = 55
    await nextTick()
    expect(d.getAttribute('aria-valuenow')).toBe('55')
  })

  it('o perfil leve liga a classe que tira as transições de mola', async () => {
    const d = montar({ comLeve: true })
    expect(d.classList.contains('ros-range--leve')).toBe(true)
    leve.value = false
    await nextTick()
    expect(d.classList.contains('ros-range--leve')).toBe(false)
  })
})
