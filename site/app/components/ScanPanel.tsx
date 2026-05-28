"use client";

import { useEffect, useState } from "react";

type BadgeStatus = "OK" | "WARN";

function Badge({ status }: { status: BadgeStatus }) {
  return (
    <span
      className="animate-badge-blink font-mono text-[10px] px-1.5 py-0.5 rounded"
      style={{
        background: status === "WARN" ? "rgba(251,191,36,0.12)" : "rgba(34,197,94,0.12)",
        color: status === "WARN" ? "#fbbf24" : "#22c55e",
        border: `1px solid ${status === "WARN" ? "rgba(251,191,36,0.3)" : "rgba(34,197,94,0.3)"}`,
      }}
    >
      [{status}]
    </span>
  );
}

function useCounter(target: number, duration: number, delay: number = 0) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    const timeout = setTimeout(() => {
      const start = performance.now();
      const tick = (now: number) => {
        const elapsed = now - start;
        const progress = Math.min(elapsed / duration, 1);
        setValue(Math.round((1 - Math.pow(1 - progress, 3)) * target));
        if (progress < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }, delay);
    return () => clearTimeout(timeout);
  }, [target, duration, delay]);
  return value;
}

function Row({ label, value, badge, delay }: { label: string; badge?: BadgeStatus; value?: string | number; delay: number }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setVisible(true), delay); return () => clearTimeout(t); }, [delay]);
  return (
    <div className="flex items-center justify-between transition-opacity duration-500" style={{ opacity: visible ? 1 : 0 }}>
      <span className="font-mono text-[11px]" style={{ color: "rgba(148,163,184,0.75)" }}>{label}</span>
      <span className="flex items-center gap-1.5">
        {value !== undefined && <span className="font-mono text-[11px]" style={{ color: "#e2e8f0" }}>{value}</span>}
        {badge && <Badge status={badge} />}
      </span>
    </div>
  );
}

function Divider() {
  return <div style={{ height: 1, background: "rgba(147,51,234,0.1)", margin: "2px 0" }} />;
}

function SectionLabel({ children }: { children: string }) {
  return (
    <div className="font-mono text-[9px] tracking-widest" style={{ color: "rgba(168,85,247,0.55)" }}>
      {children}
    </div>
  );
}

export default function ScanPanel() {
  const files  = useCounter(312,  1800, 400);
  const deps   = useCounter(48,   1400, 700);
  const health = useCounter(72,   2200, 1000);
  const circs  = useCounter(3,    1000, 800);
  const avgKb  = useCounter(8,    1200, 900);

  const [scanVisible, setScanVisible] = useState(false);
  useEffect(() => { const t = setTimeout(() => setScanVisible(true), 200); return () => clearTimeout(t); }, []);

  return (
    <div
      className="relative flex flex-col rounded-xl overflow-hidden panel-glow"
      style={{
        background: "rgba(10,10,20,0.88)",
        border: "1px solid rgba(147,51,234,0.2)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* scan line */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden rounded-xl z-10" style={{ opacity: scanVisible ? 1 : 0 }}>
        <div
          className="absolute left-0 right-0 animate-scan-line"
          style={{ height: "2px", background: "linear-gradient(to right, transparent, rgba(147,51,234,0.4), rgba(6,182,212,0.6), rgba(147,51,234,0.4), transparent)", top: 0 }}
        />
      </div>

      {/* header */}
      <div className="flex items-center justify-between px-3 py-2.5" style={{ borderBottom: "1px solid rgba(147,51,234,0.15)" }}>
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#22c55e", boxShadow: "0 0 5px rgba(34,197,94,0.8)" }} />
          <span className="font-mono text-[11px] tracking-widest font-semibold" style={{ color: "rgba(168,85,247,0.9)" }}>ARCHRADAR SCAN</span>
        </div>
        <span className="font-mono text-[10px] tracking-widest animate-badge-blink" style={{ color: "#22c55e" }}>· LIVE</span>
      </div>

      <div className="flex flex-col px-3 py-3 gap-2.5">

        {/* métricas base */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>PROJECT</SectionLabel>
          <Row label="Framework"    value="Next.js 14"      delay={300} />
          <Row label="Files"        value={files}           delay={450} />
          <Row label="Avg size"     value={`${avgKb} KB`}   delay={550} />
          <Row label="Dependencies" value={deps}            delay={650} />
        </div>

        <Divider />

        {/* análise arquitetural */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>ANALYSIS</SectionLabel>
          <Row label="Complexity"    badge="OK"   delay={850}  />
          <Row label="Coupling"      badge="WARN" delay={1000} />
          <Row label="Circular Deps" value={circs} badge="OK" delay={1100} />
        </div>

        <Divider />

        {/* tech stack */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>STACK DETECTED</SectionLabel>
          {["React 18", "TypeScript", "Tailwind CSS", "ESLint"].map((tech, i) => (
            <div key={tech} className="flex items-center gap-2 transition-opacity duration-500"
              style={{ opacity: 1 }}>
              <div className="w-1 h-1 rounded-full" style={{ background: "rgba(168,85,247,0.6)" }} />
              <span className="font-mono text-[11px]" style={{ color: "rgba(148,163,184,0.7)" }}>{tech}</span>
            </div>
          ))}
        </div>

        <Divider />

        {/* health score */}
        <div className="rounded-lg px-3 py-2.5" style={{ background: "rgba(147,51,234,0.07)", border: "1px solid rgba(147,51,234,0.18)" }}>
          <div className="flex items-end justify-between mb-1.5">
            <span className="font-mono text-[9px] tracking-widest" style={{ color: "rgba(148,163,184,0.55)" }}>HEALTH SCORE</span>
            <span className="font-mono text-[9px] tracking-widest" style={{ color: "#06b6d4" }}>GOOD</span>
          </div>
          <div className="flex items-baseline gap-1.5 mb-2">
            <span className="font-mono text-2xl font-bold"
              style={{ background: "linear-gradient(135deg, #a855f7, #06b6d4)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
              {health}
            </span>
            <span className="font-mono text-xs" style={{ color: "rgba(148,163,184,0.45)" }}>/100</span>
          </div>
          <div className="rounded-full overflow-hidden" style={{ height: 3, background: "rgba(255,255,255,0.06)" }}>
            <div className="h-full rounded-full transition-all duration-[2200ms] ease-out"
              style={{ width: `${health}%`, background: "linear-gradient(to right, #9333ea, #06b6d4)", boxShadow: "0 0 6px rgba(147,51,234,0.6)", transitionDelay: "1000ms" }} />
          </div>
        </div>

        <Divider />

        {/* findings */}
        <div className="flex flex-col gap-1.5">
          <SectionLabel>FINDINGS</SectionLabel>
          <Row label="2 high complexity files"  badge="WARN" delay={1400} />
          <Row label="1 circular dependency"    badge="OK"   delay={1500} />
          <Row label="3 outdated dependencies"  badge="WARN" delay={1600} />
        </div>

        <Divider />

        {/* recommendations */}
        <div className="flex items-center justify-between rounded-lg px-3 py-2"
          style={{ background: "rgba(6,182,212,0.05)", border: "1px solid rgba(6,182,212,0.12)" }}>
          <div>
            <div className="font-mono text-[9px] tracking-widest mb-0.5" style={{ color: "rgba(6,182,212,0.55)" }}>RECOMMENDATIONS</div>
            <span className="font-mono text-[11px]" style={{ color: "rgba(148,163,184,0.8)" }}>3 actionable insights</span>
          </div>
          <span className="font-mono text-sm font-bold" style={{ color: "#06b6d4" }}>→</span>
        </div>

      </div>
    </div>
  );
}
