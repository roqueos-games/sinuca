<template>
  <div
    ref="rootRef"
    class="ros-pool"
    :class="{ 'ros-pool--low': modoLeve }"
    :dir="estado.idioma === 'ar-AR' ? 'rtl' : 'ltr'"
  >
    <canvas ref="canvasRef" class="ros-pool__canvas" />

    <!-- player cards -->
    <template v-if="phase === 'playing' || phase === 'ended'">
      <div
        class="ros-pool__pcard ros-pool__pcard--top"
        :class="{ 'is-active': shooter === 2 && phase === 'playing' }"
      >
        <span class="ros-pool__avatar">🎱</span>
        <span class="ros-pool__pname">{{ topName }}</span>
        <span v-if="aiThinking && mode === 'ai'" class="ros-pool__thinking">
          <span class="ros-pool__pontos" aria-hidden="true"><i /><i /><i /></span>
          {{ txt('thinking') }}
        </span>
        <span class="ros-pool__dots">
          <i
            v-for="k in 7"
            :key="k"
            class="ros-pool__dot"
            :class="dotClass(2, k)"
            aria-hidden="true"
          />
          <b>{{ groupLabel(2) }}</b>
        </span>
        <button class="ros-pool__icon-btn" :aria-label="txt('newGame')" @click="toMenu">
          <Icone nome="fechar" :tamanho="18" />
        </button>
      </div>
      <div
        class="ros-pool__pcard ros-pool__pcard--bottom"
        :class="{ 'is-active': shooter === 1 && phase === 'playing' }"
      >
        <span class="ros-pool__avatar">🎱</span>
        <span class="ros-pool__pname">{{ bottomName }}</span>
        <span class="ros-pool__dots">
          <i
            v-for="k in 7"
            :key="k"
            class="ros-pool__dot"
            :class="dotClass(1, k)"
            aria-hidden="true"
          />
          <b>{{ groupLabel(1) }}</b>
        </span>
      </div>
    </template>

    <!-- foul / info toast -->
    <transition name="pool-fade">
      <div v-if="toast" class="ros-pool__toast">{{ toast }}</div>
    </transition>

    <!-- ball-in-hand hint -->
    <div v-if="ballInHand && humanTurn && phase === 'playing'" class="ros-pool__hint">
      <Icone nome="mao" :tamanho="15" /> {{ txt('placeCue') }}
    </div>

    <!-- shot controls (human aiming) -->
    <div v-if="canAim" class="ros-pool__controls">
      <button class="ros-pool__spin-btn" :aria-label="txt('spin')" @click="showSpin = !showSpin">
        <span
          class="ros-pool__spin-dot"
          :style="{ left: `${50 + spin.side * 32}%`, top: `${50 - spin.follow * 32}%` }"
        />
      </button>
      <div class="ros-pool__power">
        <Deslizador
          v-model="power"
          :min="5"
          :max="100"
          :step="1"
          :aria-label="txt('power')"
          :leve="modoLeve"
        />
      </div>
      <button class="ros-pool__shoot" @click="shootNow">
        <Icone nome="taco" :tamanho="18" />
        {{ txt('shoot') }}
      </button>
    </div>

    <!-- spin picker (cue-ball face) -->
    <div v-if="showSpin && canAim" class="ros-pool__spin-pad-wrap" @click.self="showSpin = false">
      <div
        ref="spinPadRef"
        class="ros-pool__spin-pad"
        @pointerdown="onSpinDrag"
        @pointermove="onSpinDrag"
      >
        <span
          class="ros-pool__spin-pad-dot"
          :style="{ left: `${50 + spin.side * 40}%`, top: `${50 - spin.follow * 40}%` }"
        />
      </div>
      <span class="ros-pool__spin-label">{{ txt('spinHint') }}</span>
    </div>

    <!-- menu -->
    <div v-if="phase === 'menu'" class="ros-pool__menu">
      <div class="ros-pool__logo">{{ txt('title') }}</div>
      <div class="ros-pool__sub">{{ txt('tagline') }}</div>
      <div class="ros-pool__menu-btns">
        <button class="ros-pool__mbtn ros-pool__mbtn--ai" @click="phase = 'aisetup'">
          <Icone nome="robo" :tamanho="22" />
          <span>{{ txt('vsAi') }}</span>
          <small>{{ txt('vsAiHint') }}</small>
        </button>
        <button class="ros-pool__mbtn" @click="startLocal">
          <Icone nome="pessoas" :tamanho="22" />
          <span>{{ txt('local') }}</span>
          <small>{{ txt('localHint') }}</small>
        </button>
      </div>
    </div>

    <!-- vs AI: difficulty -->
    <div v-if="phase === 'aisetup'" class="ros-pool__menu">
      <div class="ros-pool__logo">{{ txt('vsAi') }}</div>
      <div class="ros-pool__sub">{{ txt('chooseLevel') }}</div>
      <div class="ros-pool__menu-btns">
        <button class="ros-pool__mbtn" @click="startAI('easy')">
          <Icone nome="sorriso" :tamanho="22" />
          <span>{{ txt('level_easy') }}</span>
          <small>{{ txt('level_easy_hint') }}</small>
        </button>
        <button class="ros-pool__mbtn" @click="startAI('medium')">
          <Icone nome="cerebro" :tamanho="22" />
          <span>{{ txt('level_medium') }}</span>
          <small>{{ txt('level_medium_hint') }}</small>
        </button>
        <button class="ros-pool__mbtn" @click="startAI('hard')">
          <Icone nome="fogo" :tamanho="22" />
          <span>{{ txt('level_hard') }}</span>
          <small>{{ txt('level_hard_hint') }}</small>
        </button>
      </div>
      <button class="ros-pool__ghost-btn" @click="phase = 'menu'">{{ txt('cancel') }}</button>
    </div>

    <!-- result -->
    <transition name="pool-pop">
      <div v-if="phase === 'ended'" class="ros-pool__over">
        <div class="ros-pool__over-title">{{ resultText }}</div>
        <button class="ros-pool__solid-btn" @click="toMenu">
          <Icone nome="reiniciar" :tamanho="19" /> {{ txt('newGame') }}
        </button>
      </div>
    </transition>
  </div>
</template>

<script setup>
// A Sinuca. Fala com o sistema só pelo `host` do jogo-sdk: o nome do jogador,
// o áudio, o modo leve, as métricas e o texto chegam por ele, e é por isso que
// o mesmo arquivo roda dentro do RoqueOS, no `yarn dev` do repo e no teste.
//
// A Sinuca não guarda nada: nem recorde, nem mudo, nem placar na conta. Era
// assim antes da extração (nenhum `localStorage`, nenhum `gameScoresService`
// no componente do front), e o jogo.json diz o mesmo com `recorde: null`.
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { emModoE2E } from '@roqueos-games/jogo-sdk'
import { TABLE, rack8, createShot, strike, step, placeCueBall } from './engine.js'
import { createMatch, evaluateShot, legalTargets, remaining, SOLID, STRIPE } from './rules.js'
import { bestShot, bestPlacement } from './ai.js'
import { createPoolScene, CLOTH_Y } from './scene3d.js'
import { criarSom } from './som.js'
import { traduzir } from './textos.js'
import Deslizador from './Deslizador.vue'
import Icone from './Icone.vue'

const props = defineProps({
  /** O host do contrato v1 do jogo-sdk. */
  host: { type: Object, required: true },
  /** `{ ativo, idioma, textos }`, reativo; quem escreve é o `montar` do jogo. */
  estado: { type: Object, required: true },
})

const host = props.host
const txt = (chave, valores) => traduzir(props.estado.textos, chave, valores)

// ── Reactive UI ──────────────────────────────────────────────────────────────
const rootRef = ref(null)
const canvasRef = ref(null)
const spinPadRef = ref(null)
const phase = ref('menu') // 'menu' | 'aisetup' | 'playing' | 'ended'
const mode = ref('local') // 'ai' | 'local'
const aiLevel = ref('medium')
const aiThinking = ref(false)
const shooter = ref(1)
const groups = ref({ 1: null, 2: null })
const remain = ref({ 1: 7, 2: 7 })
const ballInHand = ref(false)
const shooting = ref(false)
const power = ref(55)
const spin = ref({ side: 0, follow: 0 })
const showSpin = ref(false)
const toast = ref('')
const resultText = ref('')
// O perfil leve, lido do host ao montar: liga a classe `ros-pool--low` no CSS
// e é o mesmo valor que vai para o `lowEnd` da cena 3D.
const modoLeve = ref(false)
// O nome de quem joga contra a IA. Vinha do `authStore` do RoqueOS, que é
// reativo; aqui vem da identidade do host e acompanha o `aoMudar` dela, para
// quem entra na conta com a partida aberta ver o próprio nome no cartão.
const nomeDoJogador = ref(null)

// ── Plain game state ─────────────────────────────────────────────────────────
let balls = []
let match = null
let shot = null // live engine shot (while balls roll)
let scene = null
let aimAngle = 0
let rafId = 0
let running = false
let lastT = 0
let seenEvents = 0
let resizeObserver = null
let placing = null // ball-in-hand preview {x,z}
let pararIdentidade = null

const pendingTimers = new Set()
const later = (fn, ms) => {
  const id = setTimeout(() => {
    pendingTimers.delete(id)
    fn()
  }, ms)
  pendingTimers.add(id)
  return id
}

const lerNome = () => {
  try {
    return host.identidade.atual()?.nome || null
  } catch {
    return null
  }
}
const meName = () => nomeDoJogador.value || txt('you')
const aiName = computed(() => `${txt('ai')} · ${txt(`level_${aiLevel.value}`)}`)
const topName = computed(() => (mode.value === 'ai' ? aiName.value : txt('p2')))
const bottomName = computed(() => (mode.value === 'ai' ? meName() : txt('p1')))
const humanTurn = computed(
  () => phase.value === 'playing' && (mode.value === 'local' || shooter.value === 1),
)
const canAim = computed(
  () =>
    phase.value === 'playing' &&
    humanTurn.value &&
    !shooting.value &&
    !aiThinking.value &&
    !ballInHand.value,
)

const groupLabel = (p) => {
  const g = groups.value[p]
  if (!g) return txt('open')
  const n = remain.value[p]
  if (n === 0) return txt('onThe8')
  return g === SOLID ? txt('solids') : txt('stripes')
}
const dotClass = (p, k) => {
  const g = groups.value[p]
  if (!g) return 'is-off'
  const left = remain.value[p]
  return {
    'is-solid': g === SOLID && k <= left,
    'is-stripe': g === STRIPE && k <= left,
    'is-off': k > left,
  }
}

// ── Audio (procedural) ───────────────────────────────────────────────────────
const som = criarSom(host.audio, later)
// Chamado de dentro do gesto (toque, clique), sem `await` antes: o iOS só
// libera o áudio assim.
const primeAudio = () => {
  try {
    host.audio.destravar()?.catch?.(() => {})
  } catch {
    /* best-effort */
  }
}
const buzz = (p) => {
  try {
    navigator.vibrate?.(p)
  } catch {
    /* best-effort */
  }
}

// ── Aim prediction (guideline: first contact + object direction) ─────────────
const predictAim = () => {
  const cue = balls.find((b) => b.n === 0 && !b.pocketed)
  if (!cue) return null
  const dx = Math.cos(aimAngle)
  const dz = Math.sin(aimAngle)
  let best = null
  const R2 = (2 * TABLE.R) ** 2
  for (const b of balls) {
    if (b.pocketed || b.n === 0) continue
    const ox = b.x - cue.x
    const oz = b.z - cue.z
    const proj = ox * dx + oz * dz
    if (proj <= 0) continue
    const perp2 = ox * ox + oz * oz - proj * proj
    if (perp2 > R2) continue
    const tHit = proj - Math.sqrt(R2 - perp2)
    if (!best || tHit < best.t) best = { t: tHit, b }
  }
  // distance to the nearest rail along the ray
  const lim = { x: TABLE.W / 2 - TABLE.R, z: TABLE.H / 2 - TABLE.R }
  let tRail = Infinity
  if (dx > 1e-6) tRail = Math.min(tRail, (lim.x - cue.x) / dx)
  if (dx < -1e-6) tRail = Math.min(tRail, (-lim.x - cue.x) / dx)
  if (dz > 1e-6) tRail = Math.min(tRail, (lim.z - cue.z) / dz)
  if (dz < -1e-6) tRail = Math.min(tRail, (-lim.z - cue.z) / dz)
  if (best && best.t < tRail) {
    const cx = cue.x + dx * best.t
    const cz = cue.z + dz * best.t
    const tdx = best.b.x - cx
    const tdz = best.b.z - cz
    const l = Math.hypot(tdx, tdz) || 1
    return {
      cue,
      contact: { x: cx, z: cz },
      target: { x: best.b.x, z: best.b.z, dirX: tdx / l, dirZ: tdz / l },
    }
  }
  const tEnd = Math.min(tRail, 3)
  return { cue, contact: { x: cue.x + dx * tEnd, z: cue.z + dz * tEnd }, target: null }
}

const syncAimGuide = () => {
  if (!scene) return
  if (!canAim.value) {
    scene.setAim({ visible: false })
    return
  }
  const p = predictAim()
  if (!p) return
  scene.setAim({
    visible: true,
    cue: { x: p.cue.x, z: p.cue.z },
    angle: aimAngle,
    power: power.value / 100,
    contact: p.contact,
    target: p.target,
  })
  // aiming camera: a raised 3/4 view behind the cue ball, looking down the
  // shot line. High enough that the cue ball is never hidden behind the near
  // rail and the cue doesn't graze through the apron (was too low/grazing).
  const dx = Math.cos(aimAngle)
  const dz = Math.sin(aimAngle)
  scene.setCameraPose({
    x: p.cue.x - dx * 1.18,
    y: CLOTH_Y + 0.92,
    z: p.cue.z - dz * 1.18,
    lx: p.cue.x + dx * 0.72,
    ly: CLOTH_Y,
    lz: p.cue.z + dz * 0.72,
  })
}

const overviewCamera = () => {
  scene?.setCameraPose({ x: 0, y: 2.45, z: 2.1, lx: 0, ly: CLOTH_Y - 0.15, lz: 0 })
}

// ── HUD sync ─────────────────────────────────────────────────────────────────
const syncHud = () => {
  shooter.value = match.shooter
  groups.value = { ...match.groups }
  remain.value = {
    1: match.groups[1] ? remaining(balls, match.groups[1]) : 7,
    2: match.groups[2] ? remaining(balls, match.groups[2]) : 7,
  }
  ballInHand.value = match.ballInHand
}

// ── Shot flow ────────────────────────────────────────────────────────────────
const doStrike = (params) => {
  shot = createShot(balls)
  strike(shot, params)
  seenEvents = shot.events.length
  shooting.value = true
  showSpin.value = false
  scene?.setAim({ visible: false })
  scene?.strikeCue()
  overviewCamera()
  som.tacada()
  buzz(8)
}

const shootNow = () => {
  if (!canAim.value) return
  primeAudio()
  doStrike({
    angle: aimAngle,
    power: power.value / 100,
    spin: { side: spin.value.side, follow: spin.value.follow },
  })
  spin.value = { side: 0, follow: 0 }
}

const respot8 = () => {
  const eight = balls.find((b) => b.n === 8)
  if (!eight) return
  eight.pocketed = false
  eight.vx = 0
  eight.vz = 0
  for (let dxOff = 0; dxOff < 0.5; dxOff += 0.05) {
    eight.x = TABLE.W / 4 + dxOff
    eight.z = 0
    const clear = balls.every(
      (b) => b.n === 8 || b.pocketed || Math.hypot(b.x - eight.x, b.z - eight.z) > 2 * TABLE.R,
    )
    if (clear) break
  }
}

const showToast = (msg, ms = 2200) => {
  toast.value = msg
  later(() => {
    if (toast.value === msg) toast.value = ''
  }, ms)
}

const onSettled = () => {
  shooting.value = false
  const hadGroups = !!match.groups[1]
  const verdict = evaluateShot(match, shot)
  shot = null
  if (verdict.respot8) {
    respot8()
    showToast(txt('respot8'))
  }
  if (verdict.foul) {
    const key = verdict.reasons.includes('scratch')
      ? 'foulScratch'
      : verdict.reasons.includes('no-contact')
        ? 'foulNoContact'
        : 'foulWrongBall'
    showToast(`${txt('foul')} — ${txt(key)}`)
    buzz([20, 30])
  } else if (!hadGroups && match.groups[1]) {
    const mineG = match.groups[mode.value === 'ai' ? 1 : match.shooter]
    showToast(mineG === SOLID ? txt('youAreSolids') : txt('youAreStripes'))
  }
  syncHud()
  scene?.syncBalls(balls)
  if (match.winner) {
    endGame()
    return
  }
  nextTurn()
}

const nextTurn = () => {
  if (mode.value === 'ai' && match.shooter === 2) {
    aiTurn()
    return
  }
  // human: default the aim at the nearest legal ball so the guide is useful
  const cue = balls.find((b) => b.n === 0 && !b.pocketed)
  if (cue && !match.ballInHand) {
    const targets = legalTargets(match, balls)
    let near = null
    for (const b of balls) {
      if (b.pocketed || !targets.includes(b.n)) continue
      const d = Math.hypot(b.x - cue.x, b.z - cue.z)
      if (!near || d < near.d) near = { b, d }
    }
    if (near) aimAngle = Math.atan2(near.b.z - cue.z, near.b.x - cue.x)
  }
  syncAimGuide()
}

const aiTurn = () => {
  aiThinking.value = true
  overviewCamera()
  later(() => {
    if (phase.value !== 'playing' || mode.value !== 'ai' || match.shooter !== 2) {
      aiThinking.value = false
      return
    }
    if (match.ballInHand) {
      const s = bestPlacement(balls, match)
      placeCueBall(balls, s.x, s.z)
      match.ballInHand = false
      ballInHand.value = false
      scene?.syncBalls(balls)
    }
    const botShot = bestShot(balls, match, aiLevel.value)
    // show the bot lining up (aim guide from ITS shot) before it strikes
    aimAngle = botShot.angle
    const cue = balls.find((b) => b.n === 0 && !b.pocketed)
    if (cue && scene) {
      const p = predictAim()
      scene.setAim({
        visible: true,
        cue: { x: cue.x, z: cue.z },
        angle: botShot.angle,
        power: botShot.power,
        contact: p?.contact,
        target: p?.target,
      })
    }
    later(() => {
      aiThinking.value = false
      if (phase.value === 'playing') doStrike(botShot)
    }, 650)
  }, 600)
}

const endGame = () => {
  phase.value = 'ended'
  aiThinking.value = false
  const iWon = mode.value === 'ai' ? match.winner === 1 : true
  resultText.value =
    mode.value === 'ai'
      ? iWon
        ? txt('youWin')
        : txt('youLose')
      : match.winner === 1
        ? txt('p1Wins')
        : txt('p2Wins')
  som.fim(mode.value !== 'ai' || iWon)
  host.metricas.evento('game_over', {
    mode: mode.value,
    ...(mode.value === 'ai' ? { level: aiLevel.value } : {}),
  })
}

// ── Starters ─────────────────────────────────────────────────────────────────
const newRack = () => {
  balls = rack8()
  match = createMatch()
  shot = null
  shooting.value = false
  aiThinking.value = false
  ballInHand.value = false
  placing = null
  spin.value = { side: 0, follow: 0 }
  power.value = 55
  aimAngle = 0
  syncHud()
  scene?.syncBalls(balls)
  scene?.setMarker(null)
  phase.value = 'playing'
  syncAimGuide()
}

const startLocal = () => {
  primeAudio()
  mode.value = 'local'
  newRack()
  host.metricas.evento('game_start', { mode: 'local' })
}

const startAI = (level) => {
  primeAudio()
  mode.value = 'ai'
  aiLevel.value = level || aiLevel.value
  newRack()
  host.metricas.evento('game_start', { mode: 'ai', level: aiLevel.value })
}

const toMenu = () => {
  phase.value = 'menu'
  aiThinking.value = false
  shooting.value = false
  scene?.setAim({ visible: false })
  scene?.setMarker(null)
  overviewCamera()
}

// ── Pointer interaction (aim drag / ball-in-hand placement) ──────────────────
let dragging = false
let lastPointerX = 0
const AIM_ROT_SPAN = 2.4 // a full-screen-width drag rotates the aim ~2.4 rad
const onPointerDown = (e) => {
  // O seletor de efeito também fica fora da mira. Antes da extração ele não
  // ficava: o toque no ponto da bola branca subia até a raiz, começava o
  // arrasto de mira, e puxar o ponto para o lado girava a tacada escondida
  // atrás do seletor. Achado na conversão, em 25/09/2026.
  if (
    e.target.closest('button') ||
    e.target.closest('.ros-pool__controls') ||
    e.target.closest('.ros-pool__spin-pad-wrap')
  )
    return
  if (phase.value !== 'playing' || !humanTurn.value || shooting.value || aiThinking.value) return
  primeAudio()
  dragging = true
  lastPointerX = e.clientX
  if (ballInHand.value) onPointerMove(e) // placement follows the finger immediately
}
const onPointerMove = (e) => {
  if (!dragging || !scene) return
  // Ball-in-hand placement stays absolute (drop the ball where you touch)
  if (ballInHand.value) {
    const pt = scene.screenToTable(e.clientX, e.clientY)
    if (!pt) return
    placing = pt
    scene.setMarker(pt)
    return
  }
  const cue = balls.find((b) => b.n === 0 && !b.pocketed)
  if (!cue) return
  // Aiming = RELATIVE drag → precise rotation around the cue ball, independent
  // of the camera angle (absolute touch-a-point was hypersensitive near the
  // horizon and hard to control).
  const w = rootRef.value?.clientWidth || 640
  aimAngle += ((e.clientX - lastPointerX) / w) * AIM_ROT_SPAN
  lastPointerX = e.clientX
  syncAimGuide()
}
const onPointerUp = () => {
  if (!dragging) return
  dragging = false
  if (ballInHand.value && placing) {
    if (placeCueBall(balls, placing.x, placing.z)) {
      match.ballInHand = false
      ballInHand.value = false
      scene?.setMarker(null)
      scene?.syncBalls(balls)
      placing = null
      nextTurn()
    }
  }
}

// spin pad drag → {side, follow} in the unit circle
const onSpinDrag = (e) => {
  if (e.type === 'pointermove' && e.buttons === 0) return
  const r = spinPadRef.value?.getBoundingClientRect()
  if (!r) return
  let sx = ((e.clientX - r.left) / r.width - 0.5) * 2.5
  let sy = ((e.clientY - r.top) / r.height - 0.5) * 2.5
  const len = Math.hypot(sx, sy)
  if (len > 1) {
    sx /= len
    sy /= len
  }
  spin.value = { side: Math.max(-1, Math.min(1, sx)), follow: Math.max(-1, Math.min(1, -sy)) }
}

// ── Loop ─────────────────────────────────────────────────────────────────────
// A física só anda na janela ativa (`estado.ativo`, que o host escreve) e com a
// aba visível; a janela que perde o foco para o laço inteiro. A Sinuca não tem
// teclado próprio: a única tecla que ela ouve é a do deslizador de força, e só
// com o foco nele.
const loop = (now) => {
  if (!running) return
  const dt = lastT ? Math.min(0.05, (now - lastT) / 1000) : 1 / 60
  lastT = now
  if (shot && shooting.value && props.estado.ativo !== false && !document.hidden) {
    const done = step(shot, dt)
    // play sounds for the events added this frame
    for (; seenEvents < shot.events.length; seenEvents++) {
      const ev = shot.events[seenEvents]
      if (ev.type === 'hit') som.choque()
      else if (ev.type === 'cushion') som.tabela()
      else if (ev.type === 'pocket') {
        som.cacapa()
        buzz(12)
      }
    }
    scene?.syncBalls(balls)
    if (done) onSettled()
  }
  scene?.render(dt)
  rafId = requestAnimationFrame(loop)
}
const startLoop = () => {
  if (running) return
  running = true
  lastT = 0
  rafId = requestAnimationFrame(loop)
}
const stopLoop = () => {
  running = false
  if (rafId) cancelAnimationFrame(rafId)
  rafId = 0
}

watch(
  () => props.estado.ativo,
  (active) => {
    if (active === false) stopLoop()
    else startLoop()
  },
)
watch(power, () => syncAimGuide())
const onVisibility = () => {
  if (document.hidden) stopLoop()
  else if (props.estado.ativo !== false) startLoop()
}

// ── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  modoLeve.value = Boolean(host.desempenho.modoLeve())
  nomeDoJogador.value = lerNome()
  balls = rack8()
  match = createMatch()
  scene = createPoolScene({ canvas: canvasRef.value, lowEnd: modoLeve.value })
  scene.syncBalls(balls)
  overviewCamera()
  startLoop()

  rootRef.value.addEventListener('pointerdown', onPointerDown)
  rootRef.value.addEventListener('pointermove', onPointerMove)
  rootRef.value.addEventListener('pointerup', onPointerUp)
  rootRef.value.addEventListener('pointercancel', onPointerUp)
  document.addEventListener('visibilitychange', onVisibility)
  resizeObserver = new ResizeObserver(() => scene?.resize())
  resizeObserver.observe(rootRef.value)
  // Quem entra ou sai da conta com o jogo aberto vê o próprio nome (ou "Você")
  // no cartão de baixo sem reabrir o jogo.
  pararIdentidade = host.identidade.aoMudar(() => {
    nomeDoJogador.value = lerNome()
  })

  if (emModoE2E()) {
    window.__pool = {
      get state() {
        return { balls, match, shooting: shooting.value, thinking: aiThinking.value }
      },
      get aimAngle() {
        return aimAngle
      },
      startLocal,
      startAI: (level) => startAI(level),
      shoot: (angle, pow, sp) => doStrike({ angle, power: pow ?? 0.6, spin: sp || {} }),
      settleNow: () => {
        // fast-forward the running shot to rest (deterministic — same engine)
        let guard = 0
        while (shot && shooting.value && guard++ < 600) {
          if (step(shot, 0.1)) onSettled()
        }
      },
      place: (x, z) => {
        if (placeCueBall(balls, x, z)) {
          match.ballInHand = false
          ballInHand.value = false
          scene?.syncBalls(balls)
        }
      },
      // Cover aid: a lively mid-game — pots on both sides, cue lined up
      stage: () => {
        startLocal()
        match.breakDone = true
        match.groups = { 1: SOLID, 2: STRIPE }
        const spots = [
          [0, -0.45, 0.05],
          [1, 0.18, -0.12],
          [3, 0.42, 0.18],
          [5, -0.05, 0.34],
          [7, 0.75, -0.3],
          [9, 0.3, 0.42],
          [11, 0.85, 0.25],
          [13, -0.25, -0.35],
          [8, 0.58, -0.02],
        ]
        for (const b of balls) b.pocketed = ![0].includes(b.n)
        for (const [n, x, z] of spots) {
          const b = balls.find((q) => q.n === n)
          b.pocketed = false
          b.x = x
          b.z = z
          b.vx = 0
          b.vz = 0
        }
        syncHud()
        scene?.syncBalls(balls)
        const cue = balls.find((b) => b.n === 0)
        const one = balls.find((b) => b.n === 1)
        aimAngle = Math.atan2(one.z - cue.z, one.x - cue.x)
        syncAimGuide()
      },
    }
  }
})

onUnmounted(() => {
  stopLoop()
  for (const id of pendingTimers) clearTimeout(id)
  pendingTimers.clear()
  rootRef.value?.removeEventListener('pointerdown', onPointerDown)
  rootRef.value?.removeEventListener('pointermove', onPointerMove)
  rootRef.value?.removeEventListener('pointerup', onPointerUp)
  rootRef.value?.removeEventListener('pointercancel', onPointerUp)
  document.removeEventListener('visibilitychange', onVisibility)
  resizeObserver?.disconnect()
  pararIdentidade?.()
  scene?.dispose()
  scene = null
  if (emModoE2E()) delete window.__pool
})
</script>

<style scoped lang="scss">
// Até 25/09/2026 este estilo morava em `apps/pool/styles/ros-pool.scss` do
// RoqueOS e importava os tokens do sistema. Veio para cá inteiro, com duas
// coisas a mais que lá vinham do normalize do Quasar, que no RoqueOS vale para
// a página toda e sozinho não existe (medido no `yarn dev` em 25/09/2026):
// - `box-sizing: border-box` nas caixas com borda ou padding e tamanho fixo
//   (cartões, controles, avatar, seletor de efeito). Sem isto o cartão de
//   cima ficava com 642 px em vez de 620, e o seletor com 172 em vez de 168.
// - `font: inherit` nos botões com texto. Sem isto eles caíam na fonte padrão
//   de botão do navegador (Arial no Chromium) com outra altura de linha, e os
//   botões do menu ficavam 10 px mais baixos que no RoqueOS.
// No RoqueOS as duas já valiam, então lá nada muda.
.ros-pool {
  // Cores de identidade deste jogo, como custom property para que um tema
  // consiga alcançá-las. As que vêm do sistema herdam o token do RoqueOS quando
  // ele existe e caem no valor que o tema padrão do RoqueOS dá, em 25/09/2026,
  // quando o jogo roda sozinho: fora do RoqueOS não há `tokens-root.scss`
  // nenhum carregado.
  --ros-pool-texto: var(--ros-text, rgba(255, 255, 255, 0.95));
  --ros-pool-texto-100: var(--ros-text-100, #ffffff);
  --ros-pool-texto-suave: var(--ros-text-muted, rgba(255, 255, 255, 0.72));
  --ros-pool-borda-sutil: var(--ros-border-subtle, rgba(255, 255, 255, 0.12));
  --ros-pool-borda-apagada: var(--ros-border-muted, rgba(255, 255, 255, 0.08));
  --ros-pool-borda-suave: var(--ros-border-soft, rgba(255, 255, 255, 0.1));
  --ros-pool-preenchimento-07: var(--ros-fill-07, rgba(255, 255, 255, 0.07));
  --ros-pool-preenchimento-08: var(--ros-fill-08, rgba(255, 255, 255, 0.08));
  --ros-pool-preenchimento-12: var(--ros-fill-12, rgba(255, 255, 255, 0.12));
  --ros-pool-preenchimento-16: var(--ros-fill-16, rgba(255, 255, 255, 0.16));
  --ros-pool-preenchimento-100: var(--ros-fill-100, rgba(255, 255, 255, 1));
  --ros-pool-sombra-40: var(--ros-shadow-40, rgba(0, 0, 0, 0.4));
  --ros-pool-sombra-60: var(--ros-shadow-60, rgba(0, 0, 0, 0.6));
  --ros-pool-branco-rgb: var(--ros-white-rgb, 255, 255, 255);
  --ros-pool-preto-rgb: var(--ros-black-rgb, 0, 0, 0);
  --ros-pool-desfoque: var(--ros-backdrop-blur, blur(20px));
  --ros-pool-bg-1: #191218;
  --ros-pool-bg-2: #0c080c;
  --ros-pool-bg-3: rgba(24, 16, 20, 0.62);
  --ros-pool-line-1: rgba(240, 200, 130, 0.55);
  --ros-pool-shadow-1: rgba(240, 200, 130, 0.25);
  --ros-pool-shadow-2: rgba(170, 110, 40, 0.18);
  --ros-pool-bg-4: #3c2a34;
  --ros-pool-bg-5: #1c1218;
  --ros-pool-fg-1: #efc27e;
  --ros-pool-bg-6: #f0b429;
  --ros-pool-bg-7: #f6f1e7;
  --ros-pool-bg-8: #2563eb;
  --ros-pool-bg-9: rgba(150, 90, 25, 0.88);
  --ros-pool-line-2: rgba(255, 200, 120, 0.5);
  --ros-pool-fg-2: #ffeed2;
  --ros-pool-bg-10: rgba(30, 90, 140, 0.85);
  --ros-pool-line-3: rgba(127, 212, 255, 0.5);
  --ros-pool-fg-3: #d9f1ff;
  --ros-pool-bg-11: rgba(22, 14, 18, 0.66);
  --ros-pool-bg-12: #cfc9bd;
  --ros-pool-bg-13: #9e968a;
  --ros-pool-bg-14: #c0392b;
  --ros-pool-bg-15: #e8b45e;
  --ros-pool-bg-16: #a9742f;
  --ros-pool-fg-4: #241a0d;
  --ros-pool-shadow-3: rgba(200, 150, 70, 0.35);
  --ros-pool-bg-17: #d9d2c5;
  --ros-pool-bg-18: #a49a8c;
  --ros-pool-line-4: #7c1d12;
  --ros-pool-bg-19: rgba(10, 6, 8, 0.55);
  --ros-pool-bg-20: #fdf6e8;
  --ros-pool-bg-21: #8a5a24;
  --ros-pool-bg-22: rgba(30, 20, 24, 0.78);
  --ros-pool-line-5: rgba(232, 180, 94, 0.55);
  --ros-pool-shadow-4: rgba(170, 115, 45, 0.2);
  --ros-pool-bg-23: rgba(10, 6, 8, 0.85);
  --ros-pool-bg-24: rgba(24, 16, 20, 0.92);
}

.ros-pool {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  -webkit-tap-highlight-color: transparent;
  background: linear-gradient(180deg, var(--ros-pool-bg-1) 0%, var(--ros-pool-bg-2) 100%);

  &__canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    display: block;
  }

  // ── player cards (house pattern) ─────────────────────────────────────────
  &__pcard {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    box-sizing: border-box;
    width: min(94%, 620px);
    height: 50px;
    z-index: 4;
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 8px 0 12px;
    border-radius: 13px;
    background: var(--ros-pool-bg-3);
    border: 1px solid var(--ros-pool-borda-apagada);
    backdrop-filter: var(--ros-pool-desfoque);
    -webkit-backdrop-filter: var(--ros-pool-desfoque);
    pointer-events: none;
    transition:
      border-color 0.25s ease,
      box-shadow 0.25s ease;

    &--top {
      top: 10px;
    }
    &--bottom {
      bottom: calc(12px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
    }

    &.is-active {
      border-color: var(--ros-pool-line-1);
      box-shadow:
        0 0 0 1px var(--ros-pool-shadow-1),
        0 10px 30px var(--ros-pool-shadow-2);
    }
  }

  &__avatar {
    box-sizing: border-box;
    width: 34px;
    height: 34px;
    flex: none;
    display: grid;
    place-items: center;
    font-size: 20px;
    border-radius: 10px;
    border: 1px solid var(--ros-pool-borda-sutil);
    background: linear-gradient(160deg, var(--ros-pool-bg-4), var(--ros-pool-bg-5));
  }

  &__pname {
    font-size: 13.5px;
    font-weight: 700;
    color: var(--ros-pool-texto);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  &__thinking {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin-left: 10px;
    font-size: 12px;
    font-weight: 600;
    color: var(--ros-pool-fg-1);
    white-space: nowrap;
  }

  // Os três pontos de "pensando…". Era o `q-spinner-dots` do Quasar, 16 px, na
  // cor do texto; aqui é CSS puro, no mesmo tamanho e na mesma cor.
  &__pontos {
    display: inline-flex;
    align-items: center;
    justify-content: space-between;
    width: 16px;
    height: 16px;
    flex: none;

    i {
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: currentColor;
      animation: ros-pool-pontos 1s ease-in-out infinite;
    }
    i:nth-child(2) {
      animation-delay: 0.16s;
    }
    i:nth-child(3) {
      animation-delay: 0.32s;
    }
  }

  &__dots {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-left: auto;

    b {
      margin-left: 6px;
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.4px;
      color: var(--ros-pool-fg-1);
      text-transform: uppercase;
    }
  }

  &__dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    background: var(--ros-pool-bg-6);
    box-shadow: inset 0 -2px 3px var(--ros-pool-sombra-40);

    &.is-stripe {
      background: linear-gradient(
        180deg,
        var(--ros-pool-bg-7) 20%,
        var(--ros-pool-bg-8) 20%,
        var(--ros-pool-bg-8) 80%,
        var(--ros-pool-bg-7) 80%
      );
    }
    &.is-off {
      background: var(--ros-pool-preenchimento-12);
      box-shadow: none;
    }
  }

  &__icon-btn {
    flex: none;
    width: 32px;
    height: 32px;
    display: flex;
    align-items: center;
    justify-content: center;
    border: none;
    border-radius: 50%;
    background: var(--ros-pool-preenchimento-07);
    color: var(--ros-pool-texto-suave);
    cursor: pointer;
    pointer-events: auto;

    &:hover {
      background: var(--ros-pool-preenchimento-16);
      color: var(--ros-pool-texto);
    }
  }

  // ── toasts / hints ────────────────────────────────────────────────────────
  &__toast {
    position: absolute;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    padding: 6px 16px;
    border-radius: 999px;
    background: var(--ros-pool-bg-9);
    border: 1px solid var(--ros-pool-line-2);
    color: var(--ros-pool-fg-2);
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.4px;
    white-space: nowrap;
  }

  &__hint {
    position: absolute;
    top: 70px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 14px;
    border-radius: 999px;
    background: var(--ros-pool-bg-10);
    border: 1px solid var(--ros-pool-line-3);
    color: var(--ros-pool-fg-3);
    font-size: 12px;
    font-weight: 700;
  }

  // ── shot controls ─────────────────────────────────────────────────────────
  &__controls {
    position: absolute;
    left: 50%;
    transform: translateX(-50%);
    bottom: calc(72px + var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)));
    z-index: 5;
    display: flex;
    align-items: center;
    gap: 14px;
    box-sizing: border-box;
    width: min(92%, 560px);
    padding: 10px 14px;
    border-radius: 16px;
    background: var(--ros-pool-bg-11);
    border: 1px solid rgba(var(--ros-pool-branco-rgb), 0.09);
    backdrop-filter: var(--ros-pool-desfoque);
    -webkit-backdrop-filter: var(--ros-pool-desfoque);
  }

  &__power {
    flex: 1;
    min-width: 0;
  }

  &__spin-btn {
    flex: none;
    position: relative;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    border: 1px solid rgba(var(--ros-pool-branco-rgb), 0.25);
    background: radial-gradient(
      circle at 35% 30%,
      var(--ros-pool-preenchimento-100),
      var(--ros-pool-bg-12) 70%,
      var(--ros-pool-bg-13)
    );
    cursor: pointer;
  }

  &__spin-dot {
    position: absolute;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--ros-pool-bg-14);
    transform: translate(-50%, -50%);
  }

  &__shoot {
    font: inherit;
    flex: none;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 10px 20px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--ros-pool-bg-15), var(--ros-pool-bg-16));
    color: var(--ros-pool-fg-4);
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 24px var(--ros-pool-shadow-3);

    &:hover {
      transform: translateY(-1px);
    }
  }

  // spin picker overlay
  &__spin-pad-wrap {
    position: absolute;
    inset: 0;
    z-index: 7;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 12px;
    background: rgba(var(--ros-pool-preto-rgb), 0.45);
  }

  &__spin-pad {
    position: relative;
    box-sizing: border-box;
    width: 168px;
    height: 168px;
    border-radius: 50%;
    border: 2px solid rgba(var(--ros-pool-branco-rgb), 0.35);
    background: radial-gradient(
      circle at 36% 30%,
      var(--ros-pool-preenchimento-100),
      var(--ros-pool-bg-17) 62%,
      var(--ros-pool-bg-18)
    );
    box-shadow: 0 18px 50px rgba(var(--ros-pool-preto-rgb), 0.55);
    touch-action: none;
    cursor: crosshair;
  }

  &__spin-pad-dot {
    position: absolute;
    box-sizing: border-box;
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background: var(--ros-pool-bg-14);
    border: 2px solid var(--ros-pool-line-4);
    transform: translate(-50%, -50%);
  }

  &__spin-label {
    font-size: 12.5px;
    color: var(--ros-pool-texto-suave);
    font-weight: 600;
  }

  // ── menus / overlays (house pattern) ─────────────────────────────────────
  &__menu,
  &__over {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    z-index: 6;
    padding: 24px;
    background: var(--ros-pool-bg-19);
    backdrop-filter: var(--ros-pool-desfoque);
    -webkit-backdrop-filter: var(--ros-pool-desfoque);
  }

  &__logo {
    font-size: clamp(38px, 10vw, 54px);
    font-weight: 800;
    letter-spacing: 7px;
    background: linear-gradient(
      120deg,
      var(--ros-pool-bg-20) 0%,
      var(--ros-pool-bg-15) 55%,
      var(--ros-pool-bg-21) 120%
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }

  &__sub {
    font-size: 14px;
    color: var(--ros-pool-texto-suave);
    margin-bottom: 18px;
    text-align: center;
  }

  &__menu-btns {
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: min(330px, 88%);
  }

  &__mbtn {
    font: inherit;
    display: grid;
    grid-template-columns: 26px 1fr;
    grid-template-rows: auto auto;
    column-gap: 12px;
    align-items: center;
    text-align: left;
    padding: 14px 18px;
    border: 1px solid var(--ros-pool-borda-suave);
    border-radius: 14px;
    background: var(--ros-pool-bg-22);
    color: var(--ros-pool-texto);
    cursor: pointer;
    transition:
      transform 0.15s ease,
      border-color 0.15s ease,
      box-shadow 0.15s ease;

    // Era `.q-icon`: o ícone ocupa as duas linhas da grade, na cor de ouro.
    .icone-sinuca {
      grid-row: 1 / 3;
      color: var(--ros-pool-bg-15);
    }
    span {
      font-size: 15px;
      font-weight: 700;
    }
    small {
      font-size: 11.5px;
      color: var(--ros-pool-texto-suave);
    }

    &:hover {
      transform: translateY(-2px);
      border-color: var(--ros-pool-line-5);
      box-shadow: 0 10px 26px var(--ros-pool-shadow-4);
    }
  }

  &__over-title {
    font-size: 24px;
    font-weight: 800;
    letter-spacing: 1px;
    color: var(--ros-pool-texto-100);
    text-shadow: 0 2px 18px var(--ros-pool-sombra-60);
    margin-bottom: 8px;
  }

  &__solid-btn {
    font: inherit;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 11px 26px;
    border: none;
    border-radius: 999px;
    background: linear-gradient(135deg, var(--ros-pool-bg-15), var(--ros-pool-bg-16));
    color: var(--ros-pool-fg-4);
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 8px 26px var(--ros-pool-shadow-3);
  }

  &__ghost-btn {
    font: inherit;
    padding: 9px 20px;
    border: none;
    border-radius: 999px;
    background: var(--ros-pool-preenchimento-08);
    color: var(--ros-pool-texto-suave);
    font-size: 13px;
    cursor: pointer;
  }
}

@keyframes ros-pool-pontos {
  0%,
  80%,
  100% {
    opacity: 0.25;
    transform: scale(0.7);
  }
  40% {
    opacity: 1;
    transform: scale(1);
  }
}

.pool-pop-enter-active {
  transition:
    transform 0.3s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.3s ease;
}
.pool-pop-enter-from {
  transform: scale(0.8);
  opacity: 0;
}
.pool-fade-enter-active,
.pool-fade-leave-active {
  transition: opacity 0.25s ease;
}
.pool-fade-enter-from,
.pool-fade-leave-to {
  opacity: 0;
}

// O perfil leve vem do host (`desempenho.modoLeve`), não do atributo que o
// RoqueOS põe no <html>: fora do RoqueOS esse atributo não existe.
.ros-pool--low {
  .ros-pool__menu,
  .ros-pool__over,
  .ros-pool__pcard,
  .ros-pool__controls {
    backdrop-filter: none;
    -webkit-backdrop-filter: none;
  }
  .ros-pool__menu,
  .ros-pool__over {
    background: var(--ros-pool-bg-23);
  }
  .ros-pool__pcard,
  .ros-pool__controls {
    background: var(--ros-pool-bg-24);
  }
}
</style>
