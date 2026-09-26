<template>
  <div
    ref="rootRef"
    class="ros-range"
    :class="{ 'ros-range--pressed': isPressed, 'ros-range--leve': leve }"
    :style="{ '--ros-range-fill': `${fillPercent}%` }"
    role="slider"
    :aria-valuemin="min"
    :aria-valuemax="max"
    :aria-valuenow="modelValue"
    :aria-label="ariaLabel || undefined"
    tabindex="0"
    @pointerdown="onPointerDown"
    @keydown="onKeyDown"
  >
    <div class="ros-range__track">
      <div class="ros-range__fill" />
      <div class="ros-range__thumb" />
    </div>
    <div class="ros-range__bubble" aria-hidden="true">{{ Math.round(modelValue) }}</div>
  </div>
</template>

<script setup>
// O deslizador da força da tacada. Até 25/09/2026 a Sinuca usava o
// `ROSRangeSlider` do RoqueOS; um jogo aberto não importa componente do
// RoqueOS, então ele veio para cá, recortado ao que a Sinuca usa: v-model,
// mínimo, máximo, passo e rótulo. Ficaram de fora `disabled`, o slot da bolha e
// os eventos press/release/change, que a Sinuca nunca usou.
//
// O comportamento é o de lá:
// - Pointer Events, sem toque e mouse separados, com `setPointerCapture`, para
//   o arrasto seguir mesmo quando o dedo sai da faixa.
// - Tocar em qualquer ponto da faixa pula o valor para ali E começa o arrasto;
//   não precisa acertar a bolinha.
// - `touch-action: none` na raiz: sem isso o celular rola a página quando o
//   dedo arrasta na faixa.
// - Teclado com foco: setas andam um passo, PageUp/PageDown dez, Home/End vão
//   aos extremos.
import { computed, ref } from 'vue'

const props = defineProps({
  modelValue: { type: Number, required: true },
  min: { type: Number, default: 0 },
  max: { type: Number, default: 100 },
  step: { type: Number, default: 1 },
  ariaLabel: { type: String, default: '' },
  /** O perfil leve do host: sem as transições de mola. */
  leve: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const rootRef = ref(null)
const isPressed = ref(false)

const fillPercent = computed(() => {
  const range = props.max - props.min
  if (range <= 0) return 0
  return Math.max(0, Math.min(100, ((props.modelValue - props.min) / range) * 100))
})

function valueAtClientX(clientX) {
  const el = rootRef.value
  if (!el) return props.modelValue
  const rect = el.getBoundingClientRect()
  const ratio = rect.width > 0 ? Math.max(0, Math.min(1, (clientX - rect.left) / rect.width)) : 0
  const raw = props.min + ratio * (props.max - props.min)
  // Arredonda para o passo mais próximo a partir do mínimo, como o
  // <input type="range">. Passo zero ou negativo desliga o arredondamento.
  if (props.step > 0) {
    const stepped = Math.round((raw - props.min) / props.step) * props.step + props.min
    return Math.max(props.min, Math.min(props.max, stepped))
  }
  return Math.max(props.min, Math.min(props.max, raw))
}

function emitValue(next) {
  if (next !== props.modelValue) emit('update:modelValue', next)
}

function onPointerMove(event) {
  if (!isPressed.value) return
  emitValue(valueAtClientX(event.clientX))
}

function onPointerEnd(event) {
  if (!isPressed.value) return
  isPressed.value = false
  const el = rootRef.value
  if (el) {
    el.removeEventListener('pointermove', onPointerMove)
    el.removeEventListener('pointerup', onPointerEnd)
    el.removeEventListener('pointercancel', onPointerEnd)
    if (event.pointerId != null && el.hasPointerCapture?.(event.pointerId)) {
      el.releasePointerCapture(event.pointerId)
    }
  }
}

function onPointerDown(event) {
  // Só o botão principal: toque, caneta e o botão esquerdo do mouse.
  if (event.pointerType === 'mouse' && event.button !== 0) return
  event.preventDefault()
  const el = rootRef.value
  if (!el) return
  // Captura para o arrasto fora da faixa continuar mexendo no valor.
  try {
    el.setPointerCapture(event.pointerId)
  } catch {
    /* navegador antigo ou evento que não é de ponteiro: segue sem captura */
  }
  isPressed.value = true
  emitValue(valueAtClientX(event.clientX))
  el.addEventListener('pointermove', onPointerMove)
  el.addEventListener('pointerup', onPointerEnd)
  el.addEventListener('pointercancel', onPointerEnd)
}

function onKeyDown(event) {
  const big = props.step > 0 ? props.step * 10 : (props.max - props.min) / 10
  let next = props.modelValue
  switch (event.key) {
    case 'ArrowRight':
    case 'ArrowUp':
      next = props.modelValue + props.step
      break
    case 'ArrowLeft':
    case 'ArrowDown':
      next = props.modelValue - props.step
      break
    case 'PageUp':
      next = props.modelValue + big
      break
    case 'PageDown':
      next = props.modelValue - big
      break
    case 'Home':
      next = props.min
      break
    case 'End':
      next = props.max
      break
    default:
      return
  }
  event.preventDefault()
  emitValue(Math.max(props.min, Math.min(props.max, next)))
}
</script>

<style lang="scss" scoped>
// O visual é o do `ROSRangeSlider` do RoqueOS: faixa fina e quieta em repouso,
// que engrossa no toque, com a bolinha crescendo. Quem usa pode trocar as
// cores por `--ros-range-color`, `--ros-range-track-color` e cia.
.ros-range {
  --ros-range-color: #fff;
  --ros-range-color-strong: #fff;
  --ros-range-track-color: rgba(255, 255, 255, 0.16);
  --ros-range-thumb-shadow: 0 2px 8px rgba(0, 0, 0, 0.4);
  --ros-range-thumb-shadow-active: 0 4px 16px rgba(0, 0, 0, 0.5);
  // Os quatro que vêm do sistema herdam o token do RoqueOS quando ele existe e
  // caem no valor do tema padrão do RoqueOS, em 25/09/2026, quando o jogo roda
  // sozinho: fora do RoqueOS não há `tokens-root.scss` carregado.
  --ros-range-acento-rgb: var(--ros-accent-rgb, 0, 122, 255);
  --ros-range-mola: var(--ros-ease-spring, cubic-bezier(0.175, 0.885, 0.32, 1.275));
  --ros-range-preto-rgb: var(--ros-black-rgb, 0, 0, 0);
  --ros-range-texto: var(--ros-text-100, #ffffff);

  position: relative;
  width: 100%;
  height: 28px;
  display: flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;
  // O deslizador é dono do gesto: sem isto, arrastar no celular rola a página.
  touch-action: none;

  &:focus {
    outline: none;
  }
  &:focus-visible {
    .ros-range__thumb {
      box-shadow:
        var(--ros-range-thumb-shadow),
        0 0 0 4px rgba(var(--ros-range-acento-rgb), 0.4);
    }
  }

  &__track {
    position: relative;
    width: 100%;
    height: 4px;
    background: var(--ros-range-track-color);
    border-radius: 999px;
    transition: height 0.18s var(--ros-range-mola);
  }

  &__fill {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    width: var(--ros-range-fill, 0%);
    background: linear-gradient(
      90deg,
      var(--ros-range-color) 0%,
      var(--ros-range-color-strong) 100%
    );
    border-radius: 999px;
    // Curta o bastante para parecer imediata no arrasto, e ainda suavizar a
    // mudança de valor que vem de fora (a força volta a 55 a cada partida).
    transition: width 0.08s linear;
  }

  &__thumb {
    position: absolute;
    top: 50%;
    left: var(--ros-range-fill, 0%);
    width: 14px;
    height: 14px;
    margin-left: -7px;
    margin-top: -7px;
    border-radius: 50%;
    background: var(--ros-range-color);
    box-shadow: var(--ros-range-thumb-shadow);
    transition:
      transform 0.18s var(--ros-range-mola),
      box-shadow 0.18s ease,
      left 0.08s linear;
    will-change: transform;
    pointer-events: none;
  }

  &__bubble {
    position: absolute;
    bottom: calc(100% + 6px);
    left: var(--ros-range-fill, 0%);
    transform: translateX(-50%) scale(0.9);
    transform-origin: 50% 100%;
    padding: 3px 8px;
    background: rgba(var(--ros-range-preto-rgb), 0.85);
    color: var(--ros-range-texto);
    font-size: 11px;
    font-weight: 600;
    line-height: 1;
    border-radius: 6px;
    white-space: nowrap;
    pointer-events: none;
    opacity: 0;
    transition:
      opacity 0.15s ease,
      transform 0.18s var(--ros-range-mola),
      left 0.08s linear;
  }

  // Passar o mouse (só no desktop: toque não tem hover estável) sugere que a
  // bolinha é de mexer, sem o visual de "apertado".
  @media (hover: hover) and (pointer: fine) {
    &:hover {
      .ros-range__thumb {
        transform: scale(1.18);
      }
    }
  }

  // Apertado (arrastando) ou com foco de teclado: faixa engrossa, bolinha
  // cresce, a bolha com o valor aparece.
  &--pressed,
  &:focus-visible {
    .ros-range__track {
      height: 6px;
    }
    .ros-range__thumb {
      transform: scale(1.4);
      box-shadow: var(--ros-range-thumb-shadow-active);
    }
    .ros-range__bubble {
      opacity: 1;
      transform: translateX(-50%) scale(1);
    }
  }

  // Toque (até 768 px): bolinha maior, para a ponta do dedo acertar, e área de
  // toque mais alta.
  @media (max-width: 768px) {
    height: 36px;

    &__track {
      height: 6px;
    }

    &__thumb {
      width: 18px;
      height: 18px;
      margin-left: -9px;
      margin-top: -9px;
    }

    &__bubble {
      font-size: 12px;
      padding: 4px 10px;
    }

    &--pressed {
      .ros-range__track {
        height: 8px;
      }
      .ros-range__thumb {
        transform: scale(1.3);
      }
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .ros-range__track,
    .ros-range__fill,
    .ros-range__thumb,
    .ros-range__bubble {
      transition-duration: 0ms !important;
    }
  }
}

// O perfil leve vem do host (`desempenho.modoLeve`), não do atributo que o
// RoqueOS põe no <html>: fora do RoqueOS esse atributo não existe. Sem a mola,
// mas com os mesmos estados.
.ros-range--leve {
  .ros-range__track,
  .ros-range__fill,
  .ros-range__thumb,
  .ros-range__bubble {
    transition: none !important;
  }
}
</style>
