"use client";

import React from "react";
import JellyfishSVG from "./JellyfishSVG";
import { useWaterCurrent } from "./useWaterCurrent";

// pulseDur por tamanho
function pulseDurSec(size: number): number {
  return 1.0 + ((size - 12) / (160 - 12)) * 2.2;
}

// size → classe de animação (sm < 55, lg >= 55)
function animClass(size: number, dir: "a" | "b" | "c"): string {
  return size < 55 ? `animate-rise-${dir}-sm` : `animate-rise-${dir}-lg`;
}

// `phase` = posição inicial na travessia [0..1). Vira animationDelay NEGATIVO
// (= já começa adiantada nesse ponto do ciclo) → jellies distribuídas pela tela
// desde o 1º frame, sem espera. Delay positivo congelava a jelly invisível embaixo.
const jellies = [
  { size: 18,  left: "5%",   dir: "c" as const, phase: 0.00, opacity: 0.12, id: "j0" },
  { size: 64,  left: "18%",  dir: "a" as const, phase: 0.62, opacity: 0.17, id: "j1" },
  { size: 34,  left: "33%",  dir: "b" as const, phase: 0.28, opacity: 0.14, id: "j2" },
  { size: 130, left: "50%",  dir: "c" as const, phase: 0.45, opacity: 0.22, id: "j3" },
  { size: 22,  left: "65%",  dir: "a" as const, phase: 0.80, opacity: 0.11, id: "j4" },
  { size: 100, left: "78%",  dir: "b" as const, phase: 0.12, opacity: 0.20, id: "j5" },
  { size: 48,  left: "88%",  dir: "a" as const, phase: 0.55, opacity: 0.15, id: "j6" },
  { size: 160, left: "12%",  dir: "b" as const, phase: 0.88, opacity: 0.24, id: "j7" },
];

export default function JellyfishScene() {
  useWaterCurrent();
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute inset-0" style={{ background: "rgba(10,10,15,0.72)" }} />

      {jellies.map((j) => {
        const pulse = pulseDurSec(j.size);
        // riseDur múltiplo EXATO do pulso → drift e bob nunca defasam
        const pulsesPerCrossing = 9;
        const riseSec  = pulse * pulsesPerCrossing;
        const riseDur  = `${riseSec.toFixed(2)}s`;
        const pulseDur = `${pulse.toFixed(2)}s`;
        const bobClass = j.size < 55 ? "jelly-bob-sm" : "jelly-bob-lg";

        // delays NEGATIVOS → animação já adiantada (sem espera congelada).
        // drift: -phase do ciclo longo. bob/SVG: fase de pulso correspondente.
        const driftDelay = `${(-j.phase * riseSec).toFixed(2)}s`;
        const pulsePhase = (j.phase * pulsesPerCrossing) % 1;
        const bobDelay   = `${(-pulsePhase * pulse).toFixed(2)}s`;
        return (
          // CAMADA EXTERNA — travessia lenta baixo→topo + fade (riseDur)
          <div
            key={j.id}
            className={`absolute select-none pointer-events-none ${animClass(j.size, j.dir)}`}
            style={{
              animationDelay:    driftDelay,
              animationDuration: riseDur,
              opacity:           j.opacity,
              left:              j.left,
              bottom:            "-200px",
            }}
          >
            {/* CAMADA INTERNA — gesto do pulso stop-and-go (pulseDur), em fase com o SVG */}
            <div
              className={bobClass}
              style={{
                animationDelay:    bobDelay,
                animationDuration: pulseDur,
                filter:            "drop-shadow(0 0 10px #a855f7) drop-shadow(0 0 24px #7c3aed)",
              }}
            >
              <JellyfishSVG size={j.size} id={j.id} pulseDur={pulseDur} animationDelay={bobDelay} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
