// A Sinuca inteira, montada pelo contrato do jogo-sdk com o host falso.
//
// Nenhum mock de store, de analytics ou de i18n do RoqueOS: se o jogo ainda
// alcançasse algo do RoqueOS, este arquivo não rodaria fora dele. Os oito casos
// do teste que rodava no front antes da extração, em 25/09/2026, estão aqui
// (marcados com "Do front:"), com os do contrato em volta. O único mock é o do
// three, porque o jsdom não tem WebGL (ver threeStub.js).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { nextTick } from 'vue'
import { VERSAO_DO_CONTRATO } from '@roqueos-games/jogo-sdk'
import { criarHostFalso } from '@roqueos-games/jogo-sdk/host-falso'
import jogo from '../src/index.js'
import { POCKETS } from '../src/engine.js'
import { SOLID, STRIPE } from '../src/rules.js'
import { bestShot } from '../src/ai.js'
import ptBR from '../i18n/pt-BR.json'
import enUS from '../i18n/en-US.json'
import tela from '../src/JogoSinuca.vue?raw'

vi.mock('three', async () => (await import('./threeStub.js')).criarThreeFalso())

// As texturas da mesa são desenhadas em canvas 2D. O jsdom não tem canvas 2D;
// este contexto aceita qualquer chamada, de qualquer profundidade, e não
// desenha nada (o mesmo dublê do teste de lá).
const ctx2d = () => {
  const stub = new Proxy(function () {}, {
    get: (_t, prop) => (prop === Symbol.toPrimitive ? () => 0 : stub),
    set: () => true,
    apply: () => stub,
  })
  return stub
}

const RETANGULO = { left: 0, top: 0, width: 640, height: 480, right: 640, bottom: 480, x: 0, y: 0 }

let el = null
let host = null
let montagem = null
// O laço do jogo roda no requestAnimationFrame. Aqui o quadro só anda quando o
// teste manda. É uma fila, e não "o último callback", porque as <transition>
// do Vue também pedem quadro.
let fila = []
let relogio = 0
const rodar = (n = 1, passo = 16) => {
  for (let i = 0; i < n; i++) {
    relogio += passo
    for (const fn of fila.splice(0)) fn(relogio)
  }
}

const palco = () => {
  el = document.createElement('div')
  document.body.appendChild(el)
  return el
}
const montou = () =>
  vi.waitFor(() => {
    if (!el.querySelector('.ros-pool')) throw new Error('a Sinuca ainda não montou')
  })
const montarCom = async (h, { ativo = true } = {}) => {
  host = h
  montagem = jogo.mount(palco(), host, { windowId: 'w1', ativo })
  // O app só monta com o texto do idioma carregado.
  await montou()
  await nextTick()
}
const montar = ({ ativo = true, ...opcoesDoHost } = {}) =>
  montarCom(criarHostFalso({ jogoId: 'pool', ...opcoesDoHost }), { ativo })
const $ = (sel) => el.querySelector(sel)
const $$ = (sel) => [...el.querySelectorAll(sel)]
const eventos = (nome) =>
  host.chamadas.filter((c) => c.capacidade === 'metricas' && c.args[0] === nome)
const tecla = (key) => window.dispatchEvent(new KeyboardEvent('keydown', { key }))
// Evento de ponteiro "cru", como o teste de lá: o jsdom não tem PointerEvent, e
// clientX é só leitura no MouseEvent.
const ponteiro = (alvo, tipo, x, y = 200, extra = {}) => {
  const ev = new Event(tipo, { bubbles: true, cancelable: true })
  Object.assign(ev, { clientX: x, clientY: y, buttons: 1, pointerId: 1, ...extra })
  alvo.dispatchEvent(ev)
}
const renderizador = () => $('.ros-pool__canvas').__renderizador
const bola = (n) => window.__pool.state.balls.find((b) => b.n === n)
const semente = (s) => () => {
  s = (s * 1664525 + 1013904223) >>> 0
  return s / 2 ** 32
}
// Mesa no fim: o jogador 1 com as lisas já limpas, só a branca e a 8, as duas
// alinhadas com a caçapa (+x,+z). A tacada é a da IA no nível difícil, que o
// teste da IA prova que encaçapa a bola reta sem cair a branca.
const mesaNaOito = () => {
  const { balls, match } = window.__pool.state
  match.breakDone = true
  match.groups = { 1: SOLID, 2: STRIPE }
  const p = POCKETS[3]
  for (const b of balls) {
    b.pocketed = b.n !== 0 && b.n !== 8
    b.vx = 0
    b.vz = 0
  }
  Object.assign(bola(0), { x: p.x - 0.7, z: p.z - 0.7 })
  Object.assign(bola(8), { x: p.x - 0.35, z: p.z - 0.35 })
  return bestShot(balls, match, 'hard', semente(11))
}

describe('Sinuca pelo jogo-sdk', () => {
  let origCtx
  beforeEach(() => {
    window.__ROS_E2E__ = {} // instala o gancho __pool
    origCtx = HTMLCanvasElement.prototype.getContext
    HTMLCanvasElement.prototype.getContext = vi.fn(() => ctx2d())
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockReturnValue(RETANGULO)
    fila = []
    relogio = 0
    vi.stubGlobal('requestAnimationFrame', (fn) => fila.push(fn))
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })
  afterEach(() => {
    montagem?.desmontar()
    el?.remove()
    montagem = null
    el = null
    host = null
    HTMLCanvasElement.prototype.getContext = origCtx
    delete window.__ROS_E2E__
    delete window.__pool
    vi.useRealTimers()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  it('é um jogo do SDK, com o id que o catálogo usa', () => {
    expect(jogo.id).toBe('pool')
    expect(jogo.versaoDoContrato).toBe(VERSAO_DO_CONTRATO)
    expect(jogo.capacidades).toEqual([])
  })

  // Do front: 'opens on the menu with vs-AI + local options'.
  it('abre no menu, com o nome do jogo e as opções contra a IA e local', async () => {
    await montar()
    expect($('.ros-pool__logo').textContent).toBe(ptBR.title)
    expect($('.ros-pool__sub').textContent).toBe(ptBR.tagline)
    expect($('.ros-pool__mbtn--ai')).not.toBeNull()
    expect($$('.ros-pool__mbtn')).toHaveLength(2)
    expect($$('.ros-pool__mbtn span').map((s) => s.textContent)).toEqual([ptBR.vsAi, ptBR.local])
    expect($$('.ros-pool__mbtn .icone-sinuca')).toHaveLength(2)
  })

  it('fala o idioma do host, e troca quando o host troca', async () => {
    await montar({ idioma: 'en-US' })
    expect($('.ros-pool__logo').textContent).toBe(enUS.title)
    host.disparar('idioma', 'pt-BR')
    await vi.waitFor(() => expect($('.ros-pool__logo').textContent).toBe(ptBR.title))
  })

  it('em árabe o jogo se desenha da direita para a esquerda', async () => {
    await montar({ idioma: 'ar-AR' })
    expect($('.ros-pool').getAttribute('dir')).toBe('rtl')
  })

  it('escolher o nível mostra os três, e Cancelar volta ao menu', async () => {
    await montar()
    $('.ros-pool__mbtn--ai').click()
    await nextTick()
    expect($('.ros-pool__logo').textContent).toBe(ptBR.vsAi)
    expect($$('.ros-pool__mbtn span').map((s) => s.textContent)).toEqual([
      ptBR.level_easy,
      ptBR.level_medium,
      ptBR.level_hard,
    ])
    $('.ros-pool__ghost-btn').click()
    await nextTick()
    expect($('.ros-pool__logo').textContent).toBe(ptBR.title)
  })

  // Do front: 'starts a local rack: cue + 15 balls, controls visible, analytics fires'.
  it('jogar local arma a mesa: branca e 15 bolas, controles na tela, game_start com o nome de antes', async () => {
    await montar()
    $$('.ros-pool__mbtn')[1].click()
    await nextTick()
    const st = window.__pool.state
    expect(st.balls).toHaveLength(16)
    expect(st.balls.filter((b) => !b.pocketed)).toHaveLength(16)
    expect($('.ros-pool__controls')).not.toBeNull()
    expect($('.ros-pool__shoot').textContent.trim()).toBe(ptBR.shoot)
    expect($$('.ros-pool__pname').map((n) => n.textContent)).toEqual([ptBR.p2, ptBR.p1])
    expect(eventos('game_start').map((c) => c.args)).toEqual([['game_start', { mode: 'local' }]])
  })

  it('o clique que começa a partida destrava o áudio no mesmo gesto', async () => {
    await montar()
    expect(host.contar('audio', 'destravar')).toBe(0)
    $$('.ros-pool__mbtn')[1].click()
    expect(host.contar('audio', 'destravar')).toBe(1)
  })

  // Do front: 'aiming is a RELATIVE drag around the cue ball (precise, camera-independent)'.
  it('mirar é arrasto RELATIVO em volta da branca', async () => {
    await montar()
    window.__pool.startLocal()
    await nextTick()
    const raiz = $('.ros-pool')
    const a0 = window.__pool.aimAngle
    ponteiro(raiz, 'pointerdown', 100)
    ponteiro(raiz, 'pointermove', 260) // 160 px para a direita (clientWidth 0 no jsdom → 640)
    ponteiro(raiz, 'pointerup', 260)
    const a1 = window.__pool.aimAngle
    // Δângulo = (dx / largura) * AIM_ROT_SPAN = (160 / 640) * 2.4 = 0.6 rad
    expect(a1).not.toBe(a0)
    expect(Math.abs(a1 - a0)).toBeCloseTo(0.6, 1)
  })

  it('arrastar o ponto de efeito dá efeito e NÃO gira a mira escondida atrás do seletor', async () => {
    // Defeito do componente antigo: o toque no seletor subia até a raiz e
    // começava o arrasto de mira. Sem a correção, este arrasto de 20 px girava a
    // tacada em 0,075 rad sem o jogador ver.
    await montar()
    window.__pool.startLocal()
    await nextTick()
    $('.ros-pool__spin-btn').click()
    await nextTick()
    const pad = $('.ros-pool__spin-pad')
    expect(pad).not.toBeNull()
    const a0 = window.__pool.aimAngle
    ponteiro(pad, 'pointerdown', 600, 100)
    ponteiro(pad, 'pointermove', 620, 100)
    ponteiro(pad, 'pointerup', 620, 100)
    await nextTick()
    expect(window.__pool.aimAngle).toBe(a0)
    expect($('.ros-pool__spin-pad-dot').style.left).not.toBe('50%')
    // Tocar fora da bola fecha o seletor, também sem mexer na mira.
    const fundo = $('.ros-pool__spin-pad-wrap')
    ponteiro(fundo, 'pointerdown', 10, 10)
    ponteiro(fundo, 'pointermove', 90, 10)
    fundo.click()
    await nextTick()
    expect($('.ros-pool__spin-pad')).toBeNull()
    expect(window.__pool.aimAngle).toBe(a0)
  })

  it('Tacar lança a branca com a força do deslizador e o efeito escolhido', async () => {
    await montar()
    window.__pool.startLocal()
    await nextTick()
    // Efeito: o ponto vai para a direita da bola (efeito lateral).
    $('.ros-pool__spin-btn').click()
    await nextTick()
    ponteiro($('.ros-pool__spin-pad'), 'pointerdown', 600, 240)
    $('.ros-pool__spin-pad-wrap').click()
    await nextTick()
    expect($('.ros-pool__spin-dot').style.left).not.toBe('50%')
    // Força: End leva ao máximo.
    const deslizador = $('.ros-range')
    deslizador.focus()
    deslizador.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }))
    await nextTick()
    expect(deslizador.getAttribute('aria-valuenow')).toBe('100')
    $('.ros-pool__shoot').click()
    await nextTick()
    expect(window.__pool.state.shooting).toBe(true)
    expect($('.ros-pool__controls')).toBeNull()
    // Força 100 é a velocidade máxima do motor; a branca sai correndo, com o
    // efeito lateral que o seletor deu.
    expect(Math.hypot(bola(0).vx, bola(0).vz)).toBeCloseTo(5.5, 5)
    expect(bola(0).side).toBeGreaterThan(0)
  })

  // Do front: 'a missed shot (no contact) is a foul: turn passes with ball in hand'.
  it('tacada sem tocar bola é falta: a vez passa, com bola na mão', async () => {
    await montar()
    window.__pool.startLocal()
    // atira PARA LONGE do triângulo (para a cabeceira): contato garantido zero
    window.__pool.shoot(Math.PI, 0.25)
    window.__pool.settleNow()
    await nextTick()
    const st = window.__pool.state
    expect(st.match.shooter).toBe(2)
    expect(st.match.ballInHand).toBe(true)
    expect($('.ros-pool__toast').textContent).toBe(`${ptBR.foul} — ${ptBR.foulNoContact}`)
    expect($('.ros-pool__hint').textContent.trim()).toBe(ptBR.placeCue)
  })

  // Do front: 'a scratch pockets the cue ball and gives ball in hand'.
  it('branca na caçapa é falta: bola na mão para o outro', async () => {
    await montar()
    window.__pool.startLocal()
    // estaciona a branca perto de uma caçapa de canto e atira reto nela
    const p = POCKETS[0] // canto (-x,-z)
    window.__pool.place(p.x + 0.3, p.z + 0.3)
    const st = window.__pool.state
    const cue = st.balls.find((b) => b.n === 0)
    const ang = Math.atan2(p.z - cue.z, p.x - cue.x)
    window.__pool.shoot(ang, 0.5)
    window.__pool.settleNow()
    await nextTick()
    expect(st.balls.find((b) => b.n === 0).pocketed).toBe(true)
    expect(st.match.ballInHand).toBe(true)
    expect(st.match.shooter).toBe(2)
    expect($('.ros-pool__toast').textContent).toBe(`${ptBR.foul} — ${ptBR.foulScratch}`)
  })

  // Do front: 'vs AI: after my foul the bot takes over and strikes by itself'.
  it('contra a IA: depois da minha falta a IA assume e taca sozinha', async () => {
    await montar()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    window.__pool.startAI('easy')
    expect(eventos('game_start').map((c) => c.args)).toEqual([
      ['game_start', { mode: 'ai', level: 'easy' }],
    ])
    window.__pool.shoot(Math.PI, 0.2) // erra de propósito → falta → vez da IA
    window.__pool.settleNow()
    await nextTick()
    expect(window.__pool.state.match.shooter).toBe(2)
    expect($('.ros-pool__thinking').textContent.trim()).toBe(ptBR.thinking)
    expect($$('.ros-pool__pontos i')).toHaveLength(3)
    // pensa (600 ms) + se alinha (650 ms) → a IA taca
    vi.advanceTimersByTime(1500)
    await nextTick()
    expect(window.__pool.state.shooting).toBe(true) // a tacada da IA está andando
    expect($('.ros-pool__thinking')).toBeNull()
  })

  // Do front: 'stage() builds the cover scene: mid-game with groups assigned'.
  it('stage() monta a cena da capa: meio de partida, grupos definidos', async () => {
    await montar()
    window.__pool.stage()
    await nextTick()
    const st = window.__pool.state
    expect(st.match.groups[1]).toBeTruthy()
    const vivas = st.balls.filter((b) => !b.pocketed)
    expect(vivas.length).toBeGreaterThan(5)
    expect(vivas.length).toBeLessThan(16) // algumas já encaçapadas
    expect($$('.ros-pool__dots b').map((b) => b.textContent)).toEqual([ptBR.stripes, ptBR.solids])
  })

  it('a 8 depois das suas é vitória: tela de fim e game_over com o nome e os dados de antes', async () => {
    await montar()
    window.__pool.startAI('hard')
    const tacada = mesaNaOito()
    window.__pool.shoot(tacada.angle, tacada.power, tacada.spin)
    window.__pool.settleNow()
    await nextTick()
    expect(bola(8).pocketed).toBe(true)
    expect(bola(0).pocketed).toBe(false)
    expect(window.__pool.state.match.winner).toBe(1)
    expect($('.ros-pool__over-title').textContent).toBe(ptBR.youWin)
    expect(eventos('game_over').map((c) => c.args)).toEqual([
      ['game_over', { mode: 'ai', level: 'hard' }],
    ])
    // "Novo jogo" volta ao menu.
    $('.ros-pool__solid-btn').click()
    await nextTick()
    expect($('.ros-pool__logo').textContent).toBe(ptBR.title)
  })

  it('local: a 8 antes da hora perde a partida, e game_over vai só com o modo', async () => {
    await montar()
    window.__pool.startLocal()
    const tacada = mesaNaOito()
    // As lisas do jogador 1 voltam à mesa, longe da linha: a 8 cai cedo.
    Object.assign(bola(1), { pocketed: false, x: -0.8, z: -0.4 })
    window.__pool.shoot(tacada.angle, tacada.power, tacada.spin)
    window.__pool.settleNow()
    await nextTick()
    expect(window.__pool.state.match.winner).toBe(2)
    expect($('.ros-pool__over-title').textContent).toBe(ptBR.p2Wins)
    expect(eventos('game_over').map((c) => c.args)).toEqual([['game_over', { mode: 'local' }]])
  })

  it('só a janela ativa anda: a que perde o foco congela a tacada, e nenhuma tecla do sistema mexe no jogo', async () => {
    await montar()
    window.__pool.startLocal()
    await nextTick()
    // A Sinuca não tem teclado próprio: tecla no window não começa, não mira e
    // não taca, com a janela ativa ou não.
    const a0 = window.__pool.aimAngle
    for (const k of ['ArrowLeft', 'ArrowRight', ' ', 'Enter']) tecla(k)
    expect(window.__pool.aimAngle).toBe(a0)
    expect(window.__pool.state.shooting).toBe(false)

    window.__pool.shoot(0, 0.9)
    montagem.ativar(false)
    await nextTick()
    const r = renderizador()
    const desenhar = vi.spyOn(r, 'render')
    const x0 = bola(0).x
    rodar(30)
    expect(bola(0).x).toBe(x0) // a janela inativa não anda a física
    expect(desenhar).not.toHaveBeenCalled() // nem desenha: o laço inteiro parou
    for (const k of ['ArrowLeft', ' ']) tecla(k)
    expect(window.__pool.state.shooting).toBe(true)

    montagem.ativar(true)
    await nextTick()
    rodar(30)
    expect(bola(0).x).not.toBe(x0)
    expect(desenhar).toHaveBeenCalled()
  })

  it('a janela que já nasce inativa desenha a mesa, mas não anda a física até ganhar o foco', async () => {
    // Como antes da extração: o laço começa ao montar, e a física só anda com
    // `ativo`. É o que mantém a mesa desenhada numa janela de fundo.
    await montar({ ativo: false })
    const desenhar = vi.spyOn(renderizador(), 'render')
    window.__pool.startLocal()
    window.__pool.shoot(0, 0.9)
    const x0 = bola(0).x
    rodar(30)
    expect(desenhar).toHaveBeenCalled()
    expect(bola(0).x).toBe(x0)
    montagem.ativar(true)
    await nextTick()
    rodar(30)
    expect(bola(0).x).not.toBe(x0)
  })

  it('o deslizador de força ouve o teclado só com o foco nele', async () => {
    await montar()
    window.__pool.startLocal()
    await nextTick()
    const deslizador = $('.ros-range')
    expect(deslizador.getAttribute('aria-label')).toBe(ptBR.power)
    expect(deslizador.getAttribute('aria-valuenow')).toBe('55')
    tecla('ArrowRight') // no window, sem foco: nada
    await nextTick()
    expect(deslizador.getAttribute('aria-valuenow')).toBe('55')
    deslizador.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    await nextTick()
    expect(deslizador.getAttribute('aria-valuenow')).toBe('56')
  })

  it('a Sinuca não guarda nada: nenhuma chave de armazenamento, nenhum placar na conta', async () => {
    // Antes da extração o componente não tinha `localStorage` nem
    // `gameScoresService`. Se um dia passar a guardar, é decisão nova (e chave
    // nova), não herança da extração: este caso reprova até alguém decidir.
    const h = criarHostFalso({ jogoId: 'pool' })
    const usos = []
    const original = h.armazenamento
    h.armazenamento = {
      ler: (k) => (usos.push(['ler', k]), original.ler(k)),
      gravar: (k, v) => (usos.push(['gravar', k]), original.gravar(k, v)),
      apagar: (k) => (usos.push(['apagar', k]), original.apagar(k)),
    }
    await montarCom(h)
    window.__pool.startAI('hard')
    const tacada = mesaNaOito()
    window.__pool.shoot(tacada.angle, tacada.power, tacada.spin)
    window.__pool.settleNow()
    await nextTick()
    expect($('.ros-pool__over')).not.toBeNull()
    expect(usos).toEqual([])
    expect(host.contar('placar', 'carregar')).toBe(0)
    expect(host.contar('placar', 'salvar')).toBe(0)
  })

  it('contra a IA o cartão de baixo mostra o nome da conta, e acompanha quem entra e sai', async () => {
    await montar({ uid: 'u1', nome: 'Ana' })
    window.__pool.startAI('medium')
    await nextTick()
    const [cima, baixo] = $$('.ros-pool__pname')
    expect(cima.textContent).toBe(`${ptBR.ai} · ${ptBR.level_medium}`)
    expect(baixo.textContent).toBe('Ana')
    host.disparar('identidade', { uid: 'u2', nome: 'Bia' })
    await nextTick()
    expect(baixo.textContent).toBe('Bia')
    host.disparar('identidade', { uid: null, nome: null })
    await nextTick()
    expect(baixo.textContent).toBe(ptBR.you)
  })

  // Convidado: o host do RoqueOS devolve identidade vazia, null no carregar e
  // false no salvar.
  it('convidado joga igual, como "Você", sem tocar no placar', async () => {
    const h = criarHostFalso({ jogoId: 'pool' })
    h.placar = { carregar: async () => null, salvar: async () => false }
    await montarCom(h)
    window.__pool.startAI('easy')
    await nextTick()
    expect($$('.ros-pool__pname')[1].textContent).toBe(ptBR.you)
    window.__pool.shoot(Math.PI, 0.2)
    window.__pool.settleNow()
    await nextTick()
    expect(window.__pool.state.match.shooter).toBe(2)
  })

  // O modo leve é a única coisa do código de GPU que muda de origem na
  // extração: vinha do composable do RoqueOS e agora vem do host.
  it('o perfil leve do host chega no three: sem antialias, sem sombra, pixel ratio menor', async () => {
    await montar({ modoLeve: true })
    expect($('.ros-pool').classList.contains('ros-pool--low')).toBe(true)
    const r = renderizador()
    expect(r.opcoes).toEqual({ antialias: false, alpha: false })
    expect(r.shadowMap.enabled).toBe(false)
    expect(r.pixelRatio).toBeLessThanOrEqual(1.25)
    window.__pool.startLocal()
    await nextTick()
    expect($('.ros-range').classList.contains('ros-range--leve')).toBe(true)
  })

  it('sem perfil leve o three nasce com antialias e sombra', async () => {
    await montar({ modoLeve: false })
    expect($('.ros-pool').classList.contains('ros-pool--low')).toBe(false)
    const r = renderizador()
    expect(r.opcoes).toEqual({ antialias: true, alpha: false })
    expect(r.shadowMap.enabled).toBe(true)
  })

  // Do front: 'cleans up the E2E hook on unmount'.
  it('desmontar solta tudo: o gancho, o contexto WebGL, a tela e os relógios', async () => {
    await montar()
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    window.__pool.startAI('easy')
    window.__pool.shoot(Math.PI, 0.2)
    window.__pool.settleNow() // falta: a IA fica pensando, com relógio pendente
    const r = renderizador()
    expect(window.__pool).toBeTruthy()
    montagem.desmontar()
    expect(window.__pool).toBeUndefined()
    expect(r.descartado).toBe(true)
    expect(el.querySelector('.ros-pool')).toBeNull()
    expect(el.querySelector('canvas')).toBeNull()
    expect(vi.getTimerCount()).toBe(0)
    // Desmontar de novo acontece de verdade (a janela fecha e o componente em
    // volta desmonta depois) e não pode lançar.
    expect(() => montagem.desmontar()).not.toThrow()
  })

  it('desmontar antes de o texto chegar não monta nada depois', async () => {
    host = criarHostFalso({ jogoId: 'pool' })
    montagem = jogo.mount(palco(), host, { ativo: true })
    montagem.desmontar()
    await new Promise((r) => setTimeout(r, 50))
    expect(el.querySelector('.ros-pool')).toBeNull()
  })

  it('toda chave que a tela usa existe no pt-BR', () => {
    const usadas = [...tela.matchAll(/txt\('([\w.]+)'/g)].map((m) => m[1])
    // As três de nível entram montadas (`level_${nível}`) e a regex não as vê.
    usadas.push('level_easy', 'level_medium', 'level_hard')
    expect(usadas.length).toBeGreaterThan(30)
    const faltando = usadas.filter((k) => typeof ptBR[k] !== 'string')
    expect(faltando).toEqual([])
  })
})
