"use client";

import JellyfishSVG from "../components/JellyfishSVG";

export default function Debug() {
  return (
    <div
      className="w-screen h-screen flex items-center justify-center"
      style={{ background: "#0a0a0f" }}
    >
      <div style={{ height: "90vh", display: "flex", alignItems: "center", justifyContent: "center" }}>
        <JellyfishSVG size={120} id="debug" />
      </div>
    </div>
  );
}
