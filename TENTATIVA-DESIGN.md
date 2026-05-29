# Tentativas de Design — Efeito de Água no Mouse

Registro do que foi tentado para o efeito "tela dentro da água / distorção seguindo o
mouse" no site (`site/app`). Objetivo: quando o cursor se move, distorcer o conteúdo
como se houvesse uma onda/lente de água passando por baixo dele — **sutil**, apenas na
região do cursor, mantendo o resto da tela legível.

> Status: **não concluído**. As mudanças foram descartadas (branch `feat/water-distortion`
> deletada). Este doc serve de base para a próxima tentativa.

---

## O que JÁ deu certo (em main, mantido)

Estas duas features ficaram boas e estão na `main`:

1. **Sincronia pulso + subida da jellyfish** (commit `5ee8fe0`)
   - Duas camadas: drift externo (travessia lenta baixo→topo) + bob interno (gesto do
     pulso), ambas travadas no mesmo `pulseDur` do SVG.
   - Bell simétrica por construção (`makeBellPath` espelha o lado direito em X).

2. **Tentáculos reagindo ao mouse como corrente** (PR #1, commit `61118c2`)
   - `useWaterCurrent.ts`: corrente global pela velocidade do mouse, com inércia/decay.
   - Tentáculos redesenhados em rAF: pulso + deflexão da corrente com lag por
     profundidade (chicote defasado → entrelaçam e relaxam). **Esse efeito funcionou bem.**
   - Fix de jellies congeladas: `animationDelay` positivo grande → trocado por
     `phase` → delay negativo.

---

## O que NÃO deu certo — Distorção de água na tela (descartado)

### Decisões de produto travadas com o PO (Vini)
- Efeito desejado: **uma onda/lente do tamanho do cursor**, que passa por cima do que
  estiver embaixo conforme o mouse anda.
- **Sutil.** Não pode ser na tela toda — "se for em tudo não dá pra ler nem entender o
  que está acontecendo".
- Distorcer o conteúdo real (texto/UI/jellyfish) ao vivo, sem congelar a animação.

### Tentativa 1 — WebGL shader + captura de DOM (`html-to-image`)
- **Ideia:** capturar a página como textura e rodar shader de ripple por cima.
- **Por que foi descartado antes de implementar:** capturar DOM por frame é inviável
  (100–500 ms/captura → ~2 fps). Capturar uma vez congela as jellyfish (que são
  animadas). `html-to-image` ainda erra com `WebkitTextFillColor: transparent` (título
  "archradar") e filtros SVG. WebGL **não lê DOM vivo** sem captura.

### Tentativa 2 — `feTurbulence` + `feDisplacementMap` GLOBAL (implementado, ruim)
- **Ideia:** filtro SVG no wrapper de toda a página; `scale` do displacement modulado
  pela velocidade do mouse.
- **Resultado:** distorceu a tela INTEIRA ao mesmo tempo (ilegível) e gerou **manchas/
  halos pretos** ao redor de todo texto, botão e card.
- **Causa do halo:** `feDisplacementMap` sobre conteúdo **translúcido** puxa os pixels
  transparentes (o vazio entre elementos) pra dentro do conteúdo → halo escuro nas
  bordas. O fundo opaco (`#0a0a0f`) está no `<main>`, que é **pai** do wrapper filtrado,
  então o filtro não "enxerga" o fundo — só vê transparência.

### Tentativa 3 — Lente do tamanho do cursor (implementado, halo persistiu)
- **Ideia:** limitar o displacement a um disco (~60px raio) que segue o cursor, via
  `feImage` (disco radial gerado em canvas, reposicionado por frame só mudando `x/y`) +
  `feComposite operator="in"`, e `feMerge` pondo a lente sobre o `SourceGraphic` intocado.
- **Resultado:** as manchas/halos **persistiram**.
- **Causa (hipótese forte):** o halo é **intrínseco** a distorcer DOM translúcido — dentro
  do disco, o displacement continua puxando os pixels transparentes do conteúdo. Limitar a
  área não resolve a transparência. (Não foi confirmado se parte do que se via era cache
  agressivo de `<defs>` SVG no dev server.)

---

## Aprendizados / hipóteses para a próxima tentativa

1. **`feDisplacementMap` sobre DOM translúcido = halo garantido.** Pra eliminar, o filtro
   precisa operar sobre uma camada **opaca**. Caminhos possíveis:
   - Garantir um fundo opaco (`#0a0a0f`) como **primeira camada DENTRO** do wrapper
     filtrado (não no `<main>` pai), pra o displacement puxar pixels opacos.
   - Ou aplicar o efeito só na **camada de fundo** (jellyfish/backdrop), deixando texto/UI
     nítidos por cima e fora do filtro. (Foge do "tela inteira", mas elimina halo e
     ilegibilidade.)

2. **Filtro SVG cacheia agressivo no dev.** Antes de concluir que "não funciona",
   hard-reload (Ctrl+Shift+R) ou reiniciar o dev server — a versão nova pode não ter
   carregado.

3. **Wrapper com `filter` cria containing block** → afeta `position: fixed` dos filhos
   (ex.: `JellyfishScene` usa `fixed inset-0`). Conferir se o layout não quebra.

4. **Alternativa sem refração de DOM (não testada):** overlay de "vidro molhado" /
   caustics semitransparente seguindo o cursor — não distorce o conteúdo real, mas não tem
   halo nem ilegibilidade. Trade-off: efeito mais "sobreposto" que "imersivo".

5. **Para ripples concêntricas reais** (anéis), o displacement map precisa de um canvas
   custom atualizado por frame — e `canvas.toDataURL()` por frame é lento; usar blob URL e
   baixa resolução, ou aceitar que turbulência ≠ anéis concêntricos.

---

## Arquivos que foram tocados (e revertidos)
- `site/app/components/WaterDistortion.tsx` — criado e deletado.
- `site/app/page.tsx` — wrapper `<WaterDistortion>` adicionado e revertido.
