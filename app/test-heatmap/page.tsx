"use client";

import dynamic from "next/dynamic";

// Load ParishHeatmapMap only on the client (no SSR)
const ParishHeatmapMap = dynamic(
  () => import("../components/ParishHeatmapMap"),
  { ssr: false }
);

export default function TestHeatmapPage() {
  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        padding: 16,
        boxSizing: "border-box",
        background: "#f5f5f5",
      }}
    >
      <ParishHeatmapMap
        regionId="CENLA"
        onParishSelect={(info) => console.log("Selected parish:", info)}
      />
    </div>
  );
}
