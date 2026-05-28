"use client";

import React from "react";
import JellyfishSVG from "./JellyfishSVG";

// size → duração: maior = mais devagar
function dur(size: number): string {
  const d = Math.round(20 + ((size - 12) / (160 - 12)) * 52);
  return `${d}s`;
}

// size → classe de animação (sm < 55, lg >= 55)
function animClass(size: number, dir: "a" | "b" | "c"): string {
  return size < 55 ? `animate-rise-${dir}-sm` : `animate-rise-${dir}-lg`;
}

const jellies = [
  { size: 18,  left: "5%",   dir: "c" as const, delay: "0s",   opacity: 0.12, id: "j0" },
  { size: 64,  left: "18%",  dir: "a" as const, delay: "23s",  opacity: 0.17, id: "j1" },
  { size: 34,  left: "33%",  dir: "b" as const, delay: "8s",   opacity: 0.14, id: "j2" },
  { size: 130, left: "50%",  dir: "c" as const, delay: "15s",  opacity: 0.22, id: "j3" },
  { size: 22,  left: "65%",  dir: "a" as const, delay: "31s",  opacity: 0.11, id: "j4" },
  { size: 100, left: "78%",  dir: "b" as const, delay: "4s",   opacity: 0.20, id: "j5" },
  { size: 48,  left: "88%",  dir: "a" as const, delay: "18s",  opacity: 0.15, id: "j6" },
  { size: 160, left: "12%",  dir: "b" as const, delay: "40s",  opacity: 0.24, id: "j7" },
];

export default function JellyfishScene() {
  return (
    <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
      <div className="absolute inset-0" style={{ background: "rgba(10,10,15,0.72)" }} />

      {jellies.map((j) => (
        <div
          key={j.id}
          className={`absolute select-none pointer-events-none ${animClass(j.size, j.dir)}`}
          style={{
            animationDelay:    j.delay,
            animationDuration: dur(j.size),
            opacity:           j.opacity,
            left:              j.left,
            bottom:            "-200px",
            filter:            "drop-shadow(0 0 10px #a855f7) drop-shadow(0 0 24px #7c3aed)",
          }}
        >
          <JellyfishSVG size={j.size} id={j.id} />
        </div>
      ))}
    </div>
  );
}
