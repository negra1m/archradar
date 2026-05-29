"use client";

import React, { useEffect, useRef } from "react";
import { waterCurrent } from "./useWaterCurrent";

type Props = {
  size?: number;
  id: string;
  pulseDur?: string;
  animationDelay?: string;
};

// Bell path perfeitamente simétrico.
// Estratégia: traça do CENTRO-BAIXO (0, edgeY(0)) → lóbulos subindo até a borda
// direita → ombro até o topo (0,0). O lado esquerdo é esse mesmo contorno com X
// negado, percorrido na ordem inversa. Assim os dois lados são reflexos exatos e
// os pontos de junção (centro e topo) coincidem.
function makeBellPath(bW: number, bH: number, edgeDrop = 0.40, centerRise = 0.02) {
  const ld = bH * 0.055;
  const edgeY = (absX: number) => {
    const t = absX / bW;
    return bH * (1.0 + centerRise - t * edgeDrop);
  };
  const halfLobes = 4;
  const lw = bW / halfLobes;
  const f = (n: number) => n.toFixed(3);

  // Meio-contorno DIREITO, do centro-baixo até o topo:
  //   começa em (0, edgeY(0))
  //   4 lóbulos: x=0 → x=bW (subindo a borda)
  //   ombro: borda direita → topo (0,0)
  const yBorda = edgeY(bW);                     // Y onde lóbulos encontram o ombro
  const cmds: Array<{ q?: [number, number, number, number]; c?: [number, number, number, number, number, number] }> = [];
  for (let i = 0; i < halfLobes; i++) {
    const x0 = i * lw;
    const x1 = (i + 1) * lw;
    const yl = Math.max(edgeY(x0), edgeY(x1)) + ld; // ponto de controle do lóbulo (pra baixo)
    const xm = (x0 + x1) / 2;
    cmds.push({ q: [xm, yl, x1, edgeY(x1)] });
  }
  // ombro direito: de (bW, yBorda) sobe até (0,0)
  cmds.push({ c: [bW, bH * 0.28, bW * 0.55, 0, 0, 0] });

  // Lado DIREITO: centro-baixo → borda direita → topo (na ordem de cmds[]).
  const right = cmds
    .map((c) =>
      c.q
        ? ` Q ${f(c.q[0])},${f(c.q[1])} ${f(c.q[2])},${f(c.q[3])}`
        : ` C ${f(c.c![0])},${f(c.c![1])} ${f(c.c![2])},${f(c.c![3])} ${f(c.c![4])},${f(c.c![5])}`
    )
    .join("");

  // Lado ESQUERDO: o mesmo contorno com X negado, percorrido do topo ao centro.
  // O ponto-fim de cada segmento espelhado é o ponto-INÍCIO do segmento direito
  // correspondente (= ponto-fim do segmento anterior em cmds[]).
  const startOf = (i: number): [number, number] => {
    if (i === 0) return [0, edgeY(0)];           // o 1º cmd parte do centro-baixo
    const p = cmds[i - 1];
    return p.q ? [p.q[2], p.q[3]] : [p.c![4], p.c![5]];
  };
  const left = cmds
    .map((c, i) => ({ c, end: startOf(i) }))
    .reverse()
    .map(({ c, end }) =>
      c.q
        ? ` Q ${f(-c.q[0])},${f(c.q[1])} ${f(-end[0])},${f(end[1])}`
        : ` C ${f(-c.c![2])},${f(c.c![3])} ${f(-c.c![0])},${f(c.c![1])} ${f(-end[0])},${f(end[1])}`
    )
    .join("");

  // Traça: topo → (esquerdo) → centro → (direito) → topo.
  return `M 0,0${left}${right} Z`;
}

function bellEdgeY(bx: number, bW: number, bH: number): number {
  const t = Math.abs(bx) / bW;
  return bH * (1.02 - t * 0.40);
}

// Path de tentáculo com curva "S" — ondulação de água + deflexão da corrente.
// `deflAt(depth)` devolve o deslocamento X (em userspace do SVG) que a corrente
// impõe naquela profundidade [0..1] — já com o lag por profundidade aplicado fora.
function makeTentPath(
  bx: number, len: number, drift: number,
  bW: number, bH: number, bW0: number,
  wavePhase = 0,
  deflAt: (depth: number) => number = () => 0
): string {
  const ratio = bW / bW0;
  const sbx = bx * Math.pow(ratio, 0.7);
  const ty0 = bellEdgeY(sbx, bW, bH);
  const sd = drift * Math.pow(ratio, 0.5);

  const wave = Math.sin(wavePhase * Math.PI * 2) * sd * 0.35;

  const p1x = sbx + sd * 0.40 + wave        + deflAt(0.22);
  const p1y = ty0 + len * 0.22;
  const p2x = sbx - sd * 0.30 - wave * 0.7  + deflAt(0.48);
  const p2y = ty0 + len * 0.48;
  const p3x = sbx + sd * 0.55 + wave * 0.5  + deflAt(0.76);
  const p3y = ty0 + len * 0.76;
  const endX = sbx + sd                     + deflAt(1.0);
  const endY = ty0 + len;
  const midx = (p2x + p3x) / 2;

  return `M ${sbx},${ty0} C ${p1x},${p1y} ${p2x},${p2y} ${midx},${(p2y+p3y)/2} S ${p3x},${p3y} ${endX},${endY}`;
}

// interpolação linear simples (para frames do pulso e easing)
function lerp(a: number, b: number, t: number) {
  return a + (b - a) * t;
}

export default function JellyfishSVG({ size = 80, id, pulseDur = "1.2s", animationDelay = "0s" }: Props) {
  const s = size / 100;

  const bellW = 62 * s;
  const bellH = 50 * s;

  // Ciclo sincronizado com o bob (keyTimes 0;0.08;0.22;0.45;1):
  //   0%   rest   — neutra (emenda com fim do ciclo)
  //   8%   open   — terminou de abrir, ainda PARADA
  //   22%  close  — fecha+stretch, ARRANCA a subida
  //   45%  rest   — inércia: relaxou de volta ao normal (nem aberta nem fechada)
  //   100% rest   — segue neutra, reabrindo suave p/ o próximo (emenda no 0%)
  const bellRest    = makeBellPath(bellW,        bellH,        0.40, 0.02);
  const bellOpen    = makeBellPath(bellW * 1.18, bellH * 0.78, 0.55, 0.05);
  const bellClose   = makeBellPath(bellW * 0.78, bellH * 1.42, 0.10, -0.04);

  const bellFrames = [
    { bW: bellW,        bH: bellH        },
    { bW: bellW * 1.18, bH: bellH * 0.78 },
    { bW: bellW * 0.78, bH: bellH * 1.42 },
    { bW: bellW,        bH: bellH        },
    { bW: bellW,        bH: bellH        },
  ];

  const manuY0 = bellH * 0.72;
  const manuH  = 22 * s;
  const manuW  = 5  * s;

  const oralArms = [
    { x: -11*s, w: 16*s, len: 65*s, delay: "0s",   dur: "4.2s", twist:  11*s },
    { x:   3*s, w: 20*s, len: 80*s, delay: "0.6s", dur: "3.8s", twist: -15*s },
    { x: -15*s, w: 13*s, len: 55*s, delay: "1.3s", dur: "4.6s", twist:   9*s },
    { x:  12*s, w: 15*s, len: 70*s, delay: "0.3s", dur: "3.5s", twist: -10*s },
    { x:  -3*s, w: 18*s, len: 60*s, delay: "1.8s", dur: "4.0s", twist:  13*s },
  ];

  const tentacles = [
    { bx: -bellW*0.80, len: 240*s, drift:  bellW*0.48 },
    { bx: -bellW*0.62, len: 290*s, drift: -bellW*0.38 },
    { bx: -bellW*0.44, len: 260*s, drift:  bellW*0.55 },
    { bx: -bellW*0.24, len: 310*s, drift: -bellW*0.30 },
    { bx: -bellW*0.06, len: 330*s, drift:  bellW*0.42 },
    { bx:  bellW*0.12, len: 320*s, drift: -bellW*0.45 },
    { bx:  bellW*0.30, len: 280*s, drift:  bellW*0.40 },
    { bx:  bellW*0.48, len: 300*s, drift: -bellW*0.50 },
    { bx:  bellW*0.65, len: 270*s, drift:  bellW*0.36 },
    { bx:  bellW*0.80, len: 245*s, drift: -bellW*0.44 },
  ];

  const vbX = -90 * s;
  const vbY =  -6 * s;
  const vbW = 180 * s;
  const vbH = 440 * s;

  // ── Tentáculos dirigidos por JS (pulso + corrente do mouse) ──────────────
  const tentGroupRef = useRef<SVGGElement | null>(null);

  // valores estáveis usados dentro do rAF (refs pra não recriar o efeito)
  const tentRef = useRef(tentacles);
  const framesRef = useRef(bellFrames);
  tentRef.current = tentacles;
  framesRef.current = bellFrames;

  const pulseMs = Math.max(200, parseFloat(pulseDur) * 1000 || 1200);
  const delayMs = (parseFloat(animationDelay) || 0) * 1000;
  const tentColor = `url(#tentGrad-${id})`;
  const tentWidth = Math.max(0.5, 0.75 * s);

  useEffect(() => {
    const g = tentGroupRef.current;
    if (!g) return;
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const tents = tentRef.current;
    const frames = framesRef.current;
    const bW0 = frames[0].bW;

    // cria um <path> por tentáculo (uma vez)
    const paths: SVGPathElement[] = tents.map(() => {
      const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
      p.setAttribute("stroke", tentColor);
      p.setAttribute("stroke-width", String(tentWidth));
      p.setAttribute("stroke-linecap", "round");
      p.setAttribute("fill", "none");
      g.appendChild(p);
      return p;
    });

    // buffer de histórico da corrente (X) p/ lag por profundidade — o "chicote".
    // ~0.6s de histórico a 60fps; cada ponta lê a corrente de N frames atrás.
    const HIST = 40;
    const histX = new Float32Array(HIST);
    let head = 0;

    // ganho da corrente em userspace: o quanto a deflexão entorta (escala c/ tamanho)
    const GAIN = 46 * s;

    // por tentáculo: offset de fase do pulso e do lag (faz eles se cruzarem)
    const meta = tents.map((t, i) => ({
      phaseOffset: (i * 0.13) % 1,
      lagBias: 0.35 + ((i * 7) % 11) / 11,        // 0.35..1.35 — atraso distinto
      swirl: ((i % 2) * 2 - 1),                    // ±1 — lado preferencial
      bx: t.bx, len: t.len, drift: t.drift,
    }));

    const startT = performance.now();
    let raf = 0;

    const draw = (now: number) => {
      // grava a corrente atual no buffer
      head = (head + 1) % HIST;
      histX[head] = reduce ? 0 : waterCurrent.x;

      // lê a corrente de `back` frames atrás (lag), interpolando
      const currentBack = (back: number) => {
        const f = Math.max(0, Math.min(HIST - 1.001, back));
        const i0 = Math.floor(f);
        const idx0 = (head - i0 + HIST) % HIST;
        const idx1 = (head - i0 - 1 + HIST) % HIST;
        return lerp(histX[idx0], histX[idx1], f - i0);
      };

      const tCycle = ((now - startT - delayMs) % pulseMs + pulseMs) % pulseMs / pulseMs;

      for (let i = 0; i < paths.length; i++) {
        const m = meta[i];
        // fase do pulso (ondulação) — mesma cadência de antes
        const wavePhase = (tCycle + m.phaseOffset) % 1;

        // interpola o frame do pulso (bW/bH) ao longo do ciclo, como o SMIL fazia
        const keyT = [0, 0.08, 0.22, 0.45, 1];
        let k = 0;
        while (k < keyT.length - 1 && tCycle > keyT[k + 1]) k++;
        const span = keyT[k + 1] - keyT[k] || 1;
        const lt = (tCycle - keyT[k]) / span;
        const fA = frames[k];
        const fB = frames[Math.min(k + 1, frames.length - 1)];
        const bW = lerp(fA.bW, fB.bW, lt);
        const bH = lerp(fA.bH, fB.bH, lt);

        // deflexão por profundidade: ponta lê corrente mais atrasada que a base.
        // depth² → base quase imóvel, ponta entorta muito. lagBias por tentáculo
        // e swirl alternado fazem os fios se cruzarem em vez de andar juntos.
        const deflAt = (depth: number) => {
          const back = depth * (HIST * 0.7) * m.lagBias;
          const c = currentBack(back);
          return c * GAIN * depth * depth * (0.85 + 0.15 * m.swirl);
        };

        paths[i].setAttribute(
          "d",
          makeTentPath(m.bx, m.len, m.drift, bW, bH, bW0, wavePhase, deflAt)
        );
      }

      raf = requestAnimationFrame(draw);
    };

    raf = requestAnimationFrame(draw);
    return () => {
      cancelAnimationFrame(raf);
      paths.forEach((p) => p.remove());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pulseMs, delayMs, s, tentColor, tentWidth, id]);

  return (
    <svg
      width={vbW}
      height={vbH}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible" }}
    >
      <defs>
        <filter id={`glow-${id}`} x="-10%" y="-5%" width="120%" height="115%">
          <feGaussianBlur stdDeviation={1.0 * s} result="b1" />
          <feMerge>
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <filter id={`glowSm-${id}`} x="-40%" y="-20%" width="180%" height="160%">
          <feGaussianBlur stdDeviation={2.5 * s} result="b1" />
          <feMerge>
            <feMergeNode in="b1" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>

        <radialGradient id={`bellFill-${id}`} cx="40%" cy="28%" r="72%">
          <stop offset="0%"   stopColor="#f0abfc" stopOpacity="0.78" />
          <stop offset="35%"  stopColor="#c084fc" stopOpacity="0.58" />
          <stop offset="70%"  stopColor="#7c3aed" stopOpacity="0.40" />
          <stop offset="100%" stopColor="#4338ca" stopOpacity="0.25" />
        </radialGradient>

        <radialGradient id={`bellSheen-${id}`} cx="34%" cy="20%" r="44%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.32" />
          <stop offset="100%" stopColor="#e879f9" stopOpacity="0"    />
        </radialGradient>

        <linearGradient id={`manuGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#c084fc" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.15" />
        </linearGradient>

        <linearGradient id={`armGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#67e8f9" stopOpacity="0.90" />
          <stop offset="30%"  stopColor="#22d3ee" stopOpacity="0.70" />
          <stop offset="65%"  stopColor="#818cf8" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.05" />
        </linearGradient>

        <linearGradient id={`tentGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#c084fc" stopOpacity="0.88" />
          <stop offset="40%"  stopColor="#7c3aed" stopOpacity="0.52" />
          <stop offset="80%"  stopColor="#06b6d4" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0"    />
        </linearGradient>
      </defs>

      {/* TENTÁCULOS — desenhados por JS (rAF): pulso + deflexão da corrente do
          mouse com lag por profundidade (chicote defasado → entrelaçam e relaxam) */}
      <g opacity="0.85" ref={tentGroupRef} />

      {/* MANÚBRIO */}
      <g filter={`url(#glowSm-${id})`}>
        <rect x={-manuW/2} y={manuY0} width={manuW} height={manuH}
          rx={manuW/2} fill={`url(#manuGrad-${id})`} />
      </g>

      {/* BRAÇOS ORAIS */}
      <g filter={`url(#glowSm-${id})`}>
        {oralArms.map((a, i) => {
          const y0 = manuY0 + manuH * 0.25;
          const fringes = 7;
          const buildPath = (twist: number) => {
            let d = `M ${a.x},${y0}`;
            for (let f = 0; f < fringes; f++) {
              const fy0 = y0 + (f / fringes) * a.len;
              const fy1 = y0 + ((f + 1) / fringes) * a.len;
              const fym = (fy0 + fy1) / 2;
              const side = f % 2 === 0 ? 1 : -1;
              const amp = 1 + (f / fringes) * 0.5;
              d += ` Q ${a.x + side * a.w * amp + twist * 0.12},${fym} ${a.x + twist * 0.22 * (f / fringes)},${fy1}`;
            }
            return d;
          };
          const d0 = buildPath(a.twist);
          const d1 = buildPath(a.twist * 1.6);
          const d2 = buildPath(-a.twist * 1.2);
          return (
            <path key={i} d={d0}
              stroke={`url(#armGrad-${id})`}
              strokeWidth={a.w * 0.48}
              strokeLinecap="round" strokeLinejoin="round"
              fill="none" strokeOpacity="0.80"
            >
              <animate attributeName="d" dur={a.dur} repeatCount="indefinite" begin={a.delay}
                calcMode="spline"
                keySplines="0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
                values={`${d0};${d1};${d2};${d1};${d0}`} />
            </path>
          );
        })}
      </g>

      {/* GLOW INFERIOR */}
      <ellipse
        cx="0"
        cy={bellH * 1.20}
        rx={bellW * 0.55}
        ry={bellH * 0.14}
        fill="rgba(147,51,234,0.2)"
        style={{ filter: `blur(${6 * s}px)` }}
      >
        <animate attributeName="rx"
          dur={pulseDur} begin={animationDelay} repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.08; 0.22; 0.45; 1"
          keySplines="0.3 0 0.7 1; 0.2 0 0.4 1; 0 0 1 1; 0.5 0 0.8 1"
          values={`${bellW*0.55};${bellW*0.80};${bellW*0.20};${bellW*0.30};${bellW*0.55}`}
        />
        <animate attributeName="ry"
          dur={pulseDur} begin={animationDelay} repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.08; 0.22; 0.45; 1"
          keySplines="0.3 0 0.7 1; 0.2 0 0.4 1; 0 0 1 1; 0.5 0 0.8 1"
          values={`${bellH*0.14};${bellH*0.22};${bellH*0.05};${bellH*0.08};${bellH*0.14}`}
        />
        <animate attributeName="cy"
          dur={pulseDur} begin={animationDelay} repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.08; 0.22; 0.45; 1"
          keySplines="0.3 0 0.7 1; 0.2 0 0.4 1; 0 0 1 1; 0.5 0 0.8 1"
          values={`${bellH*1.20};${bellH*1.30};${bellH*1.90};${bellH*1.55};${bellH*1.20}`}
        />
        <animate attributeName="fill-opacity"
          dur={pulseDur} begin={animationDelay} repeatCount="indefinite"
          calcMode="spline"
          keyTimes="0; 0.08; 0.22; 0.45; 1"
          keySplines="0.3 0 0.7 1; 0.2 0 0.4 1; 0 0 1 1; 0.5 0 0.8 1"
          values="1; 1.4; 0.1; 0.5; 1"
        />
      </ellipse>

      {/* BELL — na frente */}
      <g>
        <path d={bellRest}
          fill={`url(#bellFill-${id})`}
          stroke="#c084fc"
          strokeWidth={0.9 * s}
          strokeOpacity="0.55"
        >
          <animate attributeName="d"
            dur={pulseDur} begin={animationDelay} repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.08; 0.22; 0.45; 1"
            keySplines="0.3 0 0.7 1; 0.2 0 0.4 1; 0 0 1 1; 0.5 0 0.8 1"
            values={`${bellRest};${bellOpen};${bellClose};${bellRest};${bellRest}`}
          />
        </path>
        <path d={bellRest} fill={`url(#bellSheen-${id})`}>
          <animate attributeName="d"
            dur={pulseDur} begin={animationDelay} repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.08; 0.22; 0.45; 1"
            keySplines="0.3 0 0.7 1; 0.2 0 0.4 1; 0 0 1 1; 0.5 0 0.8 1"
            values={`${bellRest};${bellOpen};${bellClose};${bellRest};${bellRest}`}
          />
        </path>
      </g>
    </svg>
  );
}
