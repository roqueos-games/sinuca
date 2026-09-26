# Changelog

## 0.1.0 (25/09/2026)

- A Sinuca sai do repositório do RoqueOS e passa a falar com ele só pelo `jogo-sdk` 0.1.0.
  Física, regra, IA, cena 3D, som, visual, nomes de evento (`game_start` e `game_over`, com
  `mode` e, contra a IA, `level`) e o gancho `window.__pool` ficam como eram. O código que
  toca a GPU (`src/scene3d.js`: renderer, sombras, materiais, luzes, pixel ratio, perfil leve)
  veio sem mudança nenhuma.
- `three` vira `peerDependency`: o RoqueOS fornece o dele, na mesma versão de antes.
- O deslizador de força era o `ROSRangeSlider` do RoqueOS; agora é o `src/Deslizador.vue`,
  com o mesmo visual e o mesmo toque, arrasto e teclado.
- Texto nos dez idiomas em `i18n/`, ícones SVG próprios, os três pontos de "pensando…" em CSS,
  e o jogo roda sozinho com `yarn dev`.
- Só a janela em foco anda a física, como antes; a que perde o foco para o laço.
- Arrastar o ponto de efeito não gira mais a mira. Antes, o toque no seletor de efeito também
  começava o arrasto de mira, e a tacada girava escondida atrás do seletor.
- Contra a IA, o nome do jogador no cartão vem da identidade do host (antes vinha da store de
  conta do RoqueOS) e continua acompanhando quem entra e sai com o jogo aberto.
- O perfil leve do aparelho chega pelo host e liga a classe `ros-pool--low`.
