"use client";

import { useEffect } from "react";

/**
 * Corrente de água global dirigida pelo mouse.
 *
 * Física (figurativa): o cursor é um remo. Mover o mouse gera empuxo na direção
 * do movimento; quanto mais rápido, mais forte. Ao parar, a corrente dissipa
 * suave (inércia/viscosidade da água).
 *
 * O valor vive num singleton lido pelos tentáculos no próprio rAF — sem
 * re-render React. `current.x`/`current.y` são a corrente suavizada (px/ms-ish,
 * já normalizada e clamped em [-1, 1]).
 */
export type WaterCurrent = { x: number; y: number };

// singleton compartilhado por toda a cena
export const waterCurrent: WaterCurrent = { x: 0, y: 0 };

let listeners = 0;
let raf = 0;
let onMove: ((e: PointerEvent) => void) | null = null;

const VEL_REF = 2.2; // px/ms que mapeia ~1.0 (mouse rápido)
const RISE = 0.2;    // o quão rápido a corrente acompanha o impulso
const DECAY = 0.05;  // o quão rápido dissipa quando o mouse para

function start() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let lastX = 0;
  let lastY = 0;
  let haveLast = false;
  let lastT = performance.now();
  let velX = 0;
  let velY = 0;

  onMove = (e: PointerEvent) => {
    const now = performance.now();
    const dt = Math.max(1, now - lastT);
    if (haveLast) {
      const vx = (e.clientX - lastX) / dt;
      const vy = (e.clientY - lastY) / dt;
      velX += (vx - velX) * 0.5;
      velY += (vy - velY) * 0.5;
    }
    lastX = e.clientX;
    lastY = e.clientY;
    lastT = now;
    haveLast = true;
  };

  const tick = () => {
    const targetX = Math.max(-1, Math.min(1, velX / VEL_REF));
    const targetY = Math.max(-1, Math.min(1, velY / VEL_REF));

    waterCurrent.x += (targetX - waterCurrent.x) * RISE;
    waterCurrent.y += (targetY - waterCurrent.y) * RISE;

    velX *= 1 - DECAY;
    velY *= 1 - DECAY;
    waterCurrent.x *= 1 - DECAY * 0.6;
    waterCurrent.y *= 1 - DECAY * 0.6;

    raf = requestAnimationFrame(tick);
  };

  window.addEventListener("pointermove", onMove, { passive: true });
  raf = requestAnimationFrame(tick);
}

function stop() {
  if (onMove) window.removeEventListener("pointermove", onMove);
  cancelAnimationFrame(raf);
  onMove = null;
  waterCurrent.x = 0;
  waterCurrent.y = 0;
}

/** Liga o rastreamento global da corrente enquanto o componente estiver montado. */
export function useWaterCurrent() {
  useEffect(() => {
    listeners += 1;
    if (listeners === 1) start();
    return () => {
      listeners -= 1;
      if (listeners === 0) stop();
    };
  }, []);
}
