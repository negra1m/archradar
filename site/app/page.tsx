"use client";

import { useState } from "react";
import JellyfishScene from "./components/JellyfishScene";
import ScanPanel from "./components/ScanPanel";

function CopyCommand() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText("npx @fewcompany/archradar");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback
    }
  };

  return (
    <button
      onClick={handleCopy}
      className="group flex items-center gap-3 rounded-lg px-4 py-2.5 transition-all duration-200 cursor-pointer w-full"
      style={{
        background: "rgba(147,51,234,0.08)",
        border: "1px solid rgba(147,51,234,0.25)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "rgba(147,51,234,0.5)";
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(147,51,234,0.14)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.borderColor =
          "rgba(147,51,234,0.25)";
        (e.currentTarget as HTMLButtonElement).style.background =
          "rgba(147,51,234,0.08)";
      }}
    >
      <span
        className="font-mono text-sm flex-1 text-left"
        style={{ color: "#a855f7" }}
      >
        $ npx @fewcompany/archradar
      </span>
      <span
        className="font-mono text-xs transition-colors duration-200"
        style={{ color: copied ? "#22c55e" : "rgba(148,163,184,0.5)" }}
      >
        {copied ? (
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" style={{ color: "#22c55e" }}>
            <path d="M3 8l3.5 3.5L13 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        ) : (
          <svg viewBox="0 0 16 16" fill="none" className="w-3.5 h-3.5" style={{ color: "rgba(148,163,184,0.5)" }}>
            <rect x="5" y="1" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" />
            <rect x="2" y="4" width="9" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.4" fill="rgba(10,10,20,0.8)" />
          </svg>
        )}
      </span>
    </button>
  );
}

const features = [
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
        <circle
          cx="10"
          cy="10"
          r="8"
          stroke="#9333ea"
          strokeWidth="1.5"
          strokeDasharray="3 2"
        />
        <circle cx="10" cy="10" r="4" stroke="#06b6d4" strokeWidth="1.5" />
        <circle cx="10" cy="10" r="1.5" fill="#a855f7" />
      </svg>
    ),
    text: "Escaneie seu projeto.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
        <rect
          x="3"
          y="3"
          width="6"
          height="6"
          rx="1"
          stroke="#9333ea"
          strokeWidth="1.5"
        />
        <rect
          x="11"
          y="3"
          width="6"
          height="6"
          rx="1"
          stroke="#06b6d4"
          strokeWidth="1.5"
        />
        <rect
          x="3"
          y="11"
          width="6"
          height="6"
          rx="1"
          stroke="#06b6d4"
          strokeWidth="1.5"
        />
        <rect
          x="11"
          y="11"
          width="6"
          height="6"
          rx="1"
          stroke="#ec4899"
          strokeWidth="1.5"
        />
        <path
          d="M6 9v2M14 9v2M9 6h2M9 14h2"
          stroke="rgba(168,85,247,0.5)"
          strokeWidth="1"
        />
      </svg>
    ),
    text: "Entenda sua arquitetura.",
  },
  {
    icon: (
      <svg viewBox="0 0 20 20" fill="none" className="w-4 h-4">
        <path
          d="M10 3L3 17h14L10 3z"
          stroke="#ec4899"
          strokeWidth="1.5"
          strokeLinejoin="round"
        />
        <path
          d="M10 8v4"
          stroke="#ec4899"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <circle cx="10" cy="14" r="0.8" fill="#ec4899" />
      </svg>
    ),
    text: "Corrija o que importa.",
  },
];

const externalLinks = [
  {
    label: "NPM",
    href: "https://www.npmjs.com/package/@fewcompany/archradar",
    color: "#cb0000",
    hoverBorder: "rgba(203,0,0,0.5)",
  },
  {
    label: "GitHub",
    href: "https://github.com/negra1m/archradar",
    color: "#e2e8f0",
    hoverBorder: "rgba(226,232,240,0.4)",
  },
  {
    label: "Discord",
    href: "https://discord.gg/7YQfUMSyXq",
    color: "#5865f2",
    hoverBorder: "rgba(88,101,242,0.5)",
  },
];

export default function Home() {
  return (
    <main
      className="relative w-screen min-h-screen md:h-screen md:overflow-hidden flex flex-col"
      style={{ background: "#0a0a0f" }}
    >
      {/* medusas em toda a tela, atrás de tudo */}
      <JellyfishScene />

      {/* grid bg */}
      <div
        className="absolute inset-0 pointer-events-none animate-grid-pulse"
        style={{
          backgroundImage: `
            linear-gradient(rgba(147,51,234,0.04) 1px, transparent 1px),
            linear-gradient(90deg, rgba(147,51,234,0.04) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />


      {/* desktop: 2 colunas | mobile: coluna única com scroll */}
      <div className="relative z-10 flex-1 min-h-0 overflow-y-auto md:overflow-hidden md:grid md:grid-cols-[1fr_320px]">

        {/* HERO */}
        <div className="flex flex-col justify-center px-6 py-10 gap-5 md:px-14 md:py-0">
          <div>
            <div className="flex items-center gap-3 mb-3">
              <h1
                className="font-sans font-black tracking-tight leading-none"
                style={{
                  fontSize: "clamp(3.5rem, 12vw, 8rem)",
                  background: "linear-gradient(135deg, #a855f7 0%, #06b6d4 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  filter: "drop-shadow(0 0 28px rgba(147,51,234,0.5))",
                }}
              >
                archradar
              </h1>
              <span
                className="font-mono px-2 py-1 rounded-md font-bold tracking-widest self-center"
                style={{ fontSize: "0.7rem", background: "rgba(147,51,234,0.15)", border: "1px solid rgba(147,51,234,0.35)", color: "#a855f7" }}
              >
                CLI
              </span>
            </div>
            <p className="font-sans leading-snug" style={{ fontSize: "clamp(1rem, 3.5vw, 1.25rem)", color: "rgba(148,163,184,0.8)", maxWidth: "32rem" }}>
              Motor de Inteligência Arquitetural<br />para times de frontend modernos.
            </p>
          </div>

          <div className="flex flex-col gap-2.5">
            {features.map((f, i) => (
              <div key={i} className="flex items-center gap-3">
                <div
                  className="shrink-0 w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: "rgba(147,51,234,0.1)", border: "1px solid rgba(147,51,234,0.2)" }}
                >
                  {f.icon}
                </div>
                <span className="font-sans text-base" style={{ color: "rgba(226,232,240,0.88)" }}>
                  {f.text}
                </span>
              </div>
            ))}
          </div>

          <div className="w-full md:max-w-sm">
            <div className="font-mono text-[10px] mb-1.5 tracking-widest" style={{ color: "rgba(148,163,184,0.45)" }}>
              INSTALAR
            </div>
            <CopyCommand />
          </div>

          <div className="flex gap-2">
            {externalLinks.map((l) => (
              <a
                key={l.label}
                href={l.href}
                target="_blank"
                rel="noopener noreferrer"
                className="font-mono text-sm px-4 py-2 rounded-lg transition-all duration-200"
                style={{ color: l.color, background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.1)" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = l.hoverBorder;
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.07)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLAnchorElement).style.borderColor = "rgba(255,255,255,0.1)";
                  (e.currentTarget as HTMLAnchorElement).style.background = "rgba(255,255,255,0.04)";
                }}
              >
                {l.label}
              </a>
            ))}
          </div>
        </div>

        {/* SCAN PANEL — lado direito no desktop, abaixo no mobile */}
        <div
          className="flex flex-col justify-center px-6 py-6 md:px-5 md:py-4"
          style={{ borderTop: "1px solid rgba(147,51,234,0.08)" }}
        >
          <ScanPanel />
        </div>
      </div>

      {/* footer */}
      <footer
        className="relative z-20 flex items-center justify-center py-2 shrink-0 gap-1.5"
        style={{ borderTop: "1px solid rgba(147,51,234,0.08)" }}
      >
        <span className="font-mono text-xs" style={{ color: "rgba(148,163,184,0.25)" }}>
          powered by
        </span>
        <a
          href="https://fewcompany.com.br"
          target="_blank"
          rel="noopener noreferrer"
          className="font-mono text-xs transition-colors duration-200"
          style={{ color: "rgba(168,85,247,0.5)" }}
          onMouseEnter={e => (e.currentTarget.style.color = "rgba(168,85,247,0.9)")}
          onMouseLeave={e => (e.currentTarget.style.color = "rgba(168,85,247,0.5)")}
        >
          Few Company
        </a>
      </footer>
    </main>
  );
}
