"use client";

import React, { useRef, useState, useCallback } from "react";

type Props = {
  size?: number;
  id: string;
};

function bellEdgeY(bx: number, bW: number, bH: number): number {
  const t = Math.abs(bx) / bW; // 0=centro, 1=extremidade
  // O path da bell tem:
  // centro (t=0):      y ≈ bH * 1.02  (ponta inferior central)
  // t=0.42:            y ≈ bH * 1.00  (onde a base encontra as laterais)
  // t=0.70:            y ≈ bH * 0.88
  // extremidade (t=1): y ≈ bH * 0.62
  // Curva cúbica aproximada para seguir o path real
  const y = bH * (1.02 - 0.58 * (t * t * (3 - 2 * t))); // smoothstep
  return y;
}

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

// Gera um path de tentáculo dado o ponto de origem ty0 e offset de hover
function makeTentPath(
  bx: number, ty0: number, len: number, drift: number,
  hx: number | null
): string {
  const cx1 = bx + drift * 0.55;
  const cy1 = ty0 + len * 0.33;
  const cx2 = bx - drift * 0.38;
  const cy2 = ty0 + len * 0.68;
  const x1  = bx + drift;
  const y1  = ty0 + len;

  let devX = 0;
  if (hx !== null) {
    const norm = Math.max(-1, Math.min(1, hx / 120));
    devX = -norm * Math.abs(drift) * 0.40;
  }

  return `M ${bx},${ty0} C ${cx1 + devX*0.2},${cy1} ${cx2 + devX*0.6},${cy2} ${x1 + devX},${y1}`;
}

// Gera os 5 paths do tentáculo sincronizados com os keyframes da bell
function makeTentFrames(
  bx: number, len: number, drift: number,
  frames: Array<{ bW: number; bH: number }>
): string {
  const bW0 = frames[0].bW;
  return frames.map(({ bW, bH }) => {
    const ratio = bW / bW0;
    // bx escala com a bell mas limitado — evita sair demais nas extremidades
    const scaledBx = bx * Math.pow(ratio, 0.7);
    const ty0 = bellEdgeY(scaledBx, bW, bH);
    const scaledDrift = drift * Math.pow(ratio, 0.5);
    const cx1 = scaledBx + scaledDrift * 0.55;
    const cy1 = ty0 + len * 0.33;
    const cx2 = scaledBx - scaledDrift * 0.38;
    const cy2 = ty0 + len * 0.68;
    const x1  = scaledBx + scaledDrift;
    const y1  = ty0 + len;
    return `M ${scaledBx},${ty0} C ${cx1},${cy1} ${cx2},${cy2} ${x1},${y1}`;
  }).join(";");
}

export default function JellyfishSVG({ size = 80, id }: Props) {
  const s = size / 100;
  const svgRef = useRef<SVGSVGElement>(null);
  const leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);

  const bellW = 56 * s;
  const bellH = 52 * s;

  const bellRest    = makeBellPath(bellW,        bellH);
  const bellSquash  = makeBellPath(bellW * 1.38, bellH * 0.60);
  const bellStretch = makeBellPath(bellW * 0.80, bellH * 1.28);
  const bellSettle  = makeBellPath(bellW * 0.99, bellH * 1.03);

  // Os 5 estados da bell para sincronizar com os tentáculos
  const bellFrames = [
    { bW: bellW,        bH: bellH        }, // repouso
    { bW: bellW * 1.38, bH: bellH * 0.60 }, // squash
    { bW: bellW * 0.80, bH: bellH * 1.28 }, // stretch
    { bW: bellW * 0.99, bH: bellH * 1.03 }, // settle
    { bW: bellW,        bH: bellH        }, // repouso
  ];

  const manuY0 = bellH * 0.96;
  const manuH  = 30 * s;
  const manuW  = 6  * s;

  const oralArms = [
    { x: -9*s,  w: 13*s, len: 52*s, delay: "0s",   dur: "4.2s", twist:  9*s },
    { x:  2*s,  w: 17*s, len: 66*s, delay: "0.7s", dur: "3.8s", twist: -11*s },
    { x: -13*s, w: 11*s, len: 44*s, delay: "1.3s", dur: "4.5s", twist:  7*s  },
    { x:  10*s, w: 9*s,  len: 57*s, delay: "0.4s", dur: "3.5s", twist: -8*s  },
  ];

  const tentacles = [
    { bx: -bellW*0.94, len: 200*s, drift:  bellW*0.55, delay: "0s",   dur: "3.2s" },
    { bx: -bellW*0.72, len: 270*s, drift: -bellW*0.40, delay: "1.1s", dur: "2.8s" },
    { bx: -bellW*0.46, len: 230*s, drift:  bellW*0.65, delay: "0.3s", dur: "3.6s" },
    { bx: -bellW*0.18, len: 310*s, drift: -bellW*0.30, delay: "0.8s", dur: "2.5s" },
    { bx:  bellW*0.06, len: 350*s, drift:  bellW*0.45, delay: "0.5s", dur: "3.0s" },
    { bx:  bellW*0.30, len: 290*s, drift: -bellW*0.55, delay: "1.4s", dur: "3.3s" },
    { bx:  bellW*0.54, len: 250*s, drift:  bellW*0.35, delay: "0.2s", dur: "2.7s" },
    { bx:  bellW*0.76, len: 320*s, drift: -bellW*0.60, delay: "0.9s", dur: "3.8s" },
    { bx:  bellW*0.95, len: 195*s, drift:  bellW*0.42, delay: "0.6s", dur: "3.1s" },
  ];

  const vbX = -80 * s;
  const vbY =  -6 * s;
  const vbW = 160 * s;
  const vbH = 420 * s;

  const handleMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (leaveTimer.current) { clearTimeout(leaveTimer.current); leaveTimer.current = null; }
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const cx = rect.left + rect.width / 2;
    // converte px → coords viewBox
    const hx = (e.clientX - cx) * (vbW / rect.width);
    setHoverX(hx);
  }, [vbW]);

  const handleMouseLeave = useCallback(() => {
    leaveTimer.current = setTimeout(() => setHoverX(null), 350);
  }, []);

  return (
    <svg
      ref={svgRef}
      width={vbW}
      height={vbH}
      viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ overflow: "visible", cursor: "crosshair" }}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
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

      {/* ── TENTÁCULOS ── */}
      <g filter={`url(#glow-${id})`} opacity="0.88">
        {tentacles.map((t, i) => {
          const ty0 = bellEdgeY(t.bx, bellW, bellH);
          const dRest = makeTentPath(t.bx, ty0, t.len, t.drift, hoverX);
          // paths sincronizados com os 5 keyframes da bell
          const syncedValues = makeTentFrames(t.bx, t.len, t.drift, bellFrames);
          return (
            <path
              key={i}
              d={dRest}
              stroke={`url(#tentGrad-${id})`}
              strokeWidth={Math.max(0.8, 1.4 * s)}
              strokeLinecap="round"
            >
              {hoverX === null && (
                <animate
                  attributeName="d"
                  dur="3.8s"
                  repeatCount="indefinite"
                  calcMode="spline"
                  keyTimes="0; 0.08; 0.22; 0.55; 1"
                  keySplines="0.4 0 0.2 1; 0.1 0 0.3 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
                  values={syncedValues}
                />
              )}
            </path>
          );
        })}
      </g>

      {/* ── MEMBRANAS INTERNAS (giram no próprio eixo, dentro da bell) ── */}
      <g filter={`url(#glowSm-${id})`} clipPath={`url(#bellClip-${id})`}>
        {[
          { r: bellW * 0.52, cy: bellH * 0.45, dur: "6s",  begin: "0s",   opacity: 0.35 },
          { r: bellW * 0.34, cy: bellH * 0.38, dur: "9s",  begin: "-3s",  opacity: 0.28 },
          { r: bellW * 0.20, cy: bellH * 0.30, dur: "13s", begin: "-6s",  opacity: 0.22 },
        ].map((m, i) => (
          <ellipse
            key={i}
            cx="0"
            cy={m.cy}
            rx={m.r}
            ry={m.r * 0.22}
            stroke="#a78bfa"
            strokeWidth={1.2 * s}
            fill="none"
            strokeOpacity={m.opacity}
          >
            <animateTransform
              attributeName="transform"
              type="rotate"
              from={`0 0 ${m.cy}`}
              to={`360 0 ${m.cy}`}
              dur={m.dur}
              begin={m.begin}
              repeatCount="indefinite"
            />
          </ellipse>
        ))}
      </g>

      {/* ── BELL ── */}
      <g filter={`url(#glow-${id})`} className="bell-pulse" style={{ transformOrigin: `0px ${bellH}px` }}>
        <path d={bellRest} fill={`url(#bellFill-${id})`} stroke="#c084fc" strokeWidth={0.85 * s} strokeOpacity="0.50">
          <animate
            attributeName="d"
            dur="3.8s"
            repeatCount="indefinite"
            calcMode="spline"
            keyTimes="0; 0.08; 0.22; 0.55; 1"
            keySplines="0.4 0 0.2 1; 0.1 0 0.3 1; 0.4 0 0.6 1; 0.4 0 0.6 1"
            values={`${bellRest};${bellSquash};${bellStretch};${bellSettle};${bellRest}`}
          />
        </path>
        <path d={bellRest} fill={`url(#bellSheen-${id})`} clipPath={`url(#bellClip-${id})`} />
      </g>
    </svg>
  );
}
