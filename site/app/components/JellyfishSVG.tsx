"use client";

import React from "react";

type Props = {
  size?: number;
  id: string;
};

// Retorna o y da borda da bell para um dado x (−bellW..+bellW)
// A bell tem formato: lados em bH*0.62, centro inferior em bH*1.02
// Interpolação linear simplificada entre os pontos de controle
function bellEdgeY(bx: number, bW: number, bH: number): number {
  const t = Math.abs(bx) / bW; // 0 = centro, 1 = extremidade
  // centro: y ≈ bH * 1.02, borda: y ≈ bH * 0.62
  return bH * (1.02 - t * 0.40);
}

// Gera o path da bell dado bellW e bellH
function makeBellPath(bW: number, bH: number) {
  return [
    `M 0,0`,
    `C ${bW*0.55},0 ${bW},${bH*0.28} ${bW},${bH*0.62}`,
    `C ${bW},${bH*0.88} ${bW*0.7},${bH} ${bW*0.42},${bH}`,
    `C ${bW*0.2},${bH} ${bW*0.08},${bH*1.04} 0,${bH*1.02}`,
    `C -${bW*0.08},${bH*1.04} -${bW*0.2},${bH} -${bW*0.42},${bH}`,
    `C -${bW*0.7},${bH} -${bW},${bH*0.88} -${bW},${bH*0.62}`,
    `C -${bW},${bH*0.28} -${bW*0.55},0 0,0 Z`,
  ].join(" ");
}

export default function JellyfishSVG({ size = 80, id }: Props) {
  const s = size / 100;

  const bellW = 56 * s;
  const bellH = 52 * s;

  // 3 estados da bell: repouso, squash (amassa), stretch (estica)
  const bellRest    = makeBellPath(bellW,        bellH);
  const bellSquash  = makeBellPath(bellW * 1.38, bellH * 0.60);
  const bellStretch = makeBellPath(bellW * 0.80, bellH * 1.28);
  const bellSettle  = makeBellPath(bellW * 0.99, bellH * 1.03);

  // Manúbrio — tubo central saindo da base da bell
  const manuY0 = bellH * 0.96;
  const manuH  = 30 * s;
  const manuW  = 6  * s;

  // Braços orais — saem do manúbrio, franjas ondulantes
  const oralArms = [
    { x: -9*s,  w: 13*s, len: 52*s, delay: "0s",   dur: "4.2s", twist:  9*s },
    { x:  2*s,  w: 17*s, len: 66*s, delay: "0.7s", dur: "3.8s", twist: -11*s },
    { x: -13*s, w: 11*s, len: 44*s, delay: "1.3s", dur: "4.5s", twist:  7*s  },
    { x:  10*s, w: 9*s,  len: 57*s, delay: "0.4s", dur: "3.5s", twist: -8*s  },
  ];

  // Tentáculos — saem da BORDA da bell, fixos em y=bellH
  // drift proporcional ao bellW para curvar independente do tamanho
  const tentacles = [
    { bx: -bellW*0.94, len: 200*s, drift:  bellW*0.55,  delay: "0s",   dur: "3.2s" },
    { bx: -bellW*0.72, len: 270*s, drift: -bellW*0.40,  delay: "1.1s", dur: "2.8s" },
    { bx: -bellW*0.46, len: 230*s, drift:  bellW*0.65,  delay: "0.3s", dur: "3.6s" },
    { bx: -bellW*0.18, len: 310*s, drift: -bellW*0.30,  delay: "0.8s", dur: "2.5s" },
    { bx:  bellW*0.06, len: 350*s, drift:  bellW*0.45,  delay: "0.5s", dur: "3.0s" },
    { bx:  bellW*0.30, len: 290*s, drift: -bellW*0.55,  delay: "1.4s", dur: "3.3s" },
    { bx:  bellW*0.54, len: 250*s, drift:  bellW*0.35,  delay: "0.2s", dur: "2.7s" },
    { bx:  bellW*0.76, len: 320*s, drift: -bellW*0.60,  delay: "0.9s", dur: "3.8s" },
    { bx:  bellW*0.95, len: 195*s, drift:  bellW*0.42,  delay: "0.6s", dur: "3.1s" },
  ];

  // tentY0 por tentáculo — segue a borda real da bell


  const vbX = -80 * s;
  const vbY =  -6 * s;
  const vbW = 160 * s;
  const vbH = 420 * s;

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
        <filter id={`glow-${id}`} x="-60%" y="-30%" width="220%" height="180%">
          <feGaussianBlur stdDeviation={2 * s} result="b1" />
          <feGaussianBlur stdDeviation={7 * s} result="b2" />
          <feMerge>
            <feMergeNode in="b2" />
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
          <stop offset="0%"   stopColor="#f0abfc" stopOpacity="0.85" />
          <stop offset="30%"  stopColor="#c084fc" stopOpacity="0.70" />
          <stop offset="65%"  stopColor="#7c3aed" stopOpacity="0.52" />
          <stop offset="100%" stopColor="#4338ca" stopOpacity="0.22" />
        </radialGradient>

        <radialGradient id={`bellSheen-${id}`} cx="34%" cy="20%" r="44%">
          <stop offset="0%"   stopColor="#ffffff" stopOpacity="0.30" />
          <stop offset="100%" stopColor="#e879f9" stopOpacity="0"    />
        </radialGradient>

        <linearGradient id={`manuGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#c084fc" stopOpacity="0.75" />
          <stop offset="100%" stopColor="#7c3aed" stopOpacity="0.15" />
        </linearGradient>

        <linearGradient id={`armGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#a78bfa" stopOpacity="0.85" />
          <stop offset="45%"  stopColor="#06b6d4" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0.05" />
        </linearGradient>

        <linearGradient id={`tentGrad-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#c084fc" stopOpacity="0.90" />
          <stop offset="45%"  stopColor="#7c3aed" stopOpacity="0.50" />
          <stop offset="80%"  stopColor="#06b6d4" stopOpacity="0.22" />
          <stop offset="100%" stopColor="#06b6d4" stopOpacity="0"    />
        </linearGradient>

        <clipPath id={`bellClip-${id}`}>
          <path d={bellRest} />
        </clipPath>
      </defs>

      {/* ── TENTÁCULOS (atrás) ── */}
      <g filter={`url(#glow-${id})`} opacity="0.88">
        {tentacles.map((t, i) => {
          const ty0  = bellEdgeY(t.bx, bellW, bellH);
          const y1   = ty0 + t.len;
          const cx1  = t.bx + t.drift * 0.55;
          const cy1  = ty0 + t.len * 0.33;
          const cx2  = t.bx - t.drift * 0.38;
          const cy2  = ty0 + t.len * 0.68;
          const x1   = t.bx + t.drift;

          const d0 = `M ${t.bx},${ty0} C ${cx1},${cy1} ${cx2},${cy2} ${x1},${y1}`;
          const d1 = `M ${t.bx},${ty0} C ${cx1+t.drift*0.75},${cy1+2.5*s} ${cx2-t.drift*0.55},${cy2-2*s} ${x1-t.drift*0.28},${y1}`;

          return (
            <path key={i} d={d0} stroke={`url(#tentGrad-${id})`} strokeWidth={Math.max(0.8, 1.4*s)} strokeLinecap="round">
              <animate attributeName="d" dur={t.dur} repeatCount="indefinite" begin={t.delay}
                calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                values={`${d0};${d1};${d0}`} />
            </path>
          );
        })}
      </g>

      {/* ── MANÚBRIO ── */}
      <g filter={`url(#glowSm-${id})`}>
        <rect x={-manuW/2} y={manuY0} width={manuW} height={manuH} rx={manuW/2} fill={`url(#manuGrad-${id})`} />
      </g>

      {/* ── BRAÇOS ORAIS ── */}
      <g filter={`url(#glowSm-${id})`}>
        {oralArms.map((a, i) => {
          const y0 = manuY0 + manuH * 0.25;
          const fringes = 5;

          const buildPath = (twist: number) => {
            let d = `M ${a.x},${y0}`;
            for (let f = 0; f < fringes; f++) {
              const fy0 = y0 + (f / fringes) * a.len;
              const fy1 = y0 + ((f + 1) / fringes) * a.len;
              const fym = (fy0 + fy1) / 2;
              const side = f % 2 === 0 ? 1 : -1;
              d += ` Q ${a.x + side * a.w + twist * 0.15},${fym} ${a.x + twist * 0.28 * (f / fringes)},${fy1}`;
            }
            return d;
          };

          const d0 = buildPath(a.twist);
          const d1 = buildPath(a.twist * 1.5);

          return (
            <path key={i} d={d0} stroke={`url(#armGrad-${id})`}
              strokeWidth={a.w * 0.5} strokeLinecap="round" strokeLinejoin="round"
              fill="none" strokeOpacity="0.72">
              <animate attributeName="d" dur={a.dur} repeatCount="indefinite" begin={a.delay}
                calcMode="spline" keySplines="0.4 0 0.6 1; 0.4 0 0.6 1"
                values={`${d0};${d1};${d0}`} />
            </path>
          );
        })}
      </g>

      {/* ── BELL (frente) ── */}
      {/*
        O squash/stretch é feito via CSS no <g> da bell usando transform-origin na base.
        A classe .bell-pulse é definida no globals.css e sincroniza com o rise-* do container.
        transform-origin: center bottom mantém a base da bell fixa em bellH.
      */}
      <g
        filter={`url(#glow-${id})`}
        className="bell-pulse"
        style={{ transformOrigin: `0px ${bellH}px` }}
      >
        <path
          d={bellRest}
          fill={`url(#bellFill-${id})`}
          stroke="#c084fc"
          strokeWidth={0.85 * s}
          strokeOpacity="0.50"
        />

        {/* sheen */}
        <path d={bellRest} fill={`url(#bellSheen-${id})`} clipPath={`url(#bellClip-${id})`} />

      </g>
    </svg>
  );
}
