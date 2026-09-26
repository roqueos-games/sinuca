// O som da Sinuca, procedural: nenhum arquivo de áudio, só osciladores curtos
// (o estalo das bolas, a tabela, a caçapa, a tacada e o fim de partida). O
// AudioContext é do host (no RoqueOS, o compartilhado com os apps de música;
// fora dele, um próprio), e o jogo só toca quando o contexto já está rodando,
// porque tocar num contexto suspenso enfileira som que sai tudo junto depois.
// A Sinuca não tem botão de mudo, nem tinha antes da extração.

/**
 * @param {{ contexto: () => AudioContext | null }} audio a capacidade `audio` do host
 * @param {(fn: () => void, ms: number) => unknown} agendar o `later` do jogo: as
 *   notas atrasadas usam o relógio dele, que desmontar limpa, para nenhuma nota
 *   tocar depois que a janela fechou.
 */
export function criarSom(audio, agendar) {
  let volume = null
  let dono = null

  const contexto = () => {
    try {
      const c = audio.contexto()
      if (!c || c.state !== 'running') return null
      // O ganho mestre pertence a UM contexto. Se o host trocar de contexto
      // (o iOS fecha o antigo ao voltar do fundo), recria em vez de ligar num
      // nó morto.
      if (dono !== c) {
        volume = c.createGain()
        volume.gain.value = 0.4
        volume.connect(c.destination)
        dono = c
      }
      return c
    } catch {
      return null
    }
  }

  const blip = (freq, type = 'sine', peak = 0.1, dur = 0.1) => {
    const c = contexto()
    if (!c) return
    const now = c.currentTime
    const o = c.createOscillator()
    o.type = type
    o.frequency.value = freq
    const g = c.createGain()
    g.gain.setValueAtTime(0.0001, now)
    g.gain.exponentialRampToValueAtTime(peak, now + 0.008)
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur)
    g.connect(volume)
    o.connect(g)
    o.start(now)
    o.stop(now + dur + 0.02)
  }

  return {
    /** Bola contra bola. */
    choque() {
      blip(2600, 'square', 0.06, 0.03)
      blip(900, 'triangle', 0.1, 0.05)
    },
    /** Bola na tabela. */
    tabela() {
      blip(190, 'sine', 0.1, 0.09)
    },
    /** Bola na caçapa: dois tons, o segundo mais grave, 60 ms depois. */
    cacapa() {
      blip(320, 'sine', 0.12, 0.12)
      agendar(() => blip(140, 'sine', 0.14, 0.2), 60)
    },
    /** O taco na branca. */
    tacada() {
      blip(1400, 'square', 0.09, 0.04)
    },
    /** Fim de partida: arpejo que sobe na vitória e desce na derrota. */
    fim(venceu) {
      const notas = venceu ? [60, 64, 67, 72] : [64, 60, 55]
      notas.forEach((m, i) =>
        agendar(() => blip(440 * Math.pow(2, (m - 69) / 12), 'triangle', 0.14, 0.3), i * 110),
      )
    },
  }
}
