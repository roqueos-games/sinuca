<template>
  <svg
    class="icone-sinuca"
    :width="tamanho"
    :height="tamanho"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    <template v-if="nome === 'fechar'">
      <path d="m6 6 12 12" />
      <path d="M18 6 6 18" />
    </template>
    <template v-else-if="nome === 'reiniciar'">
      <path d="M5.2 13.5a7 7 0 1 0 1.9-6.4" />
      <path d="M4.5 4v4.5H9" />
    </template>
    <template v-else-if="nome === 'mao'">
      <path d="M9.5 11V5a1.5 1.5 0 0 1 3 0v6" />
      <path d="M12.5 10.5V9a1.5 1.5 0 0 1 3 0v2" />
      <path
        d="M15.5 11a1.5 1.5 0 0 1 3 0v3.5a6.5 6.5 0 0 1-6.5 6.5h-.7a6 6 0 0 1-4.6-2.2L4.3 15.4a1.5 1.5 0 0 1 2.3-1.9l2.9 2.5V11"
      />
    </template>
    <template v-else-if="nome === 'taco'">
      <path d="M4 20 14.5 9.5" />
      <path d="m13 8 3 3" />
      <path d="m12 7 5-5 5 5-5 5z" />
      <circle cx="6.5" cy="7" r="2.2" />
    </template>
    <template v-else-if="nome === 'robo'">
      <rect x="5" y="8" width="14" height="10.5" rx="2.5" />
      <path d="M12 8V4.5" />
      <path d="M9.3 12.5h.01" />
      <path d="M14.7 12.5h.01" />
      <path d="M10 15.5h4" />
      <path d="M3 12v3" />
      <path d="M21 12v3" />
    </template>
    <template v-else-if="nome === 'pessoas'">
      <circle cx="9" cy="8.5" r="3" />
      <path d="M3.5 19.5a5.5 5.5 0 0 1 11 0" />
      <circle cx="16.5" cy="9.5" r="2.5" />
      <path d="M16 14.2a4.5 4.5 0 0 1 4.5 4.8" />
    </template>
    <template v-else-if="nome === 'sorriso'">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14.2a4.2 4.2 0 0 0 7 0" />
      <path d="M9 9.8h.01" />
      <path d="M15 9.8h.01" />
    </template>
    <template v-else-if="nome === 'cerebro'">
      <path
        d="M9 20.5v-3H7.5A2.5 2.5 0 0 1 5 15v-2l-1.5-.5L5 9.5a7 7 0 0 1 13.8 1.6c0 2.2-1 3.8-2.3 5v4.4"
      />
      <path d="M11 8.5a2 2 0 0 1 3.5 1.3 2 2 0 0 1-1.5 1.9v1.3" />
    </template>
    <template v-else-if="nome === 'fogo'">
      <path
        d="M12 21a6.5 6.5 0 0 0 6.5-6.5c0-3.6-2.4-5.6-3.7-8.3-.5 2-1.6 3.1-2.8 3.6.2-2.8-.9-5.4-3-6.8.2 3.4-3.5 6.4-3.5 11.5A6.5 6.5 0 0 0 12 21z"
      />
    </template>
  </svg>
</template>

<script setup>
// Os ícones da Sinuca, desenhados aqui. O jogo roda num app Vue próprio, sem o
// Quasar do RoqueOS, então `q-icon` não existe para ele; e um jogo aberto não
// pode depender da fonte de ícones de outro produto. Desenho autoral, sem
// licença de terceiro (o catálogo comum dos jogos da roqueos-games).
defineProps({
  nome: {
    type: String,
    required: true,
    validator: (v) =>
      [
        'fechar',
        'reiniciar',
        'mao',
        'taco',
        'robo',
        'pessoas',
        'sorriso',
        'cerebro',
        'fogo',
      ].includes(v),
  },
  tamanho: { type: [Number, String], default: 18 },
})
</script>

<style scoped>
.icone-sinuca {
  display: block;
  flex: none;
}
</style>
