"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

type HeatmapMapPanelProps = {
  region: string;
  parishId: number;
};

type GeoJsonFeature = GeoJSON.Feature<GeoJSON.Geometry, any>;

export default function HeatmapMapPanel({ region, parishId }: HeatmapMapPanelProps) {
  // You can center roughly on CENLA; fitBounds will override once parish loads
  const initialCenter: [number, number] = [30.7, -92.3];

  return (
    <div className="w-full h-full">
      <MapContainer
        center={initialCenter}
        zoom={9}
        style={{ width: "100%", height: "100%" }}
      >
        {/* 1) OpenStreetMap base tiles */}
        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

        {/* 2) Parish boundary overlay loaded from GeoJSON */}
        <ParishBoundaryLayer parishId={parishId} />
      </MapContainer>
    </div>
  );
}

function ParishBoundaryLayer({ parishId }: { parishId: number }) {
  const [feature, setFeature] = useState<GeoJsonFeature | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const map = useMap();

  // Wait for map to be fully initialized
  useEffect(() => {
    if (!map) return;

    const checkReady = () => {
      try {
        // Check if map container is ready
        if (map.getContainer() && map.getSize().x > 0) {
          setMapReady(true);
        }
      } catch {
        // Map not ready yet
      }
    };

    // Check immediately and also after a short delay
    checkReady();
    const timer = setTimeout(checkReady, 100);

    // Also listen for map ready event
    map.whenReady(() => setMapReady(true));

    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (!mapReady) return;

    // Call your future API that returns the parish boundary as GeoJSON
    fetch(`/api/geo/parish-boundary?parishId=${parishId}`)
      .then((r) => r.json())
      .then((data) => {
        if (!data?.feature) return;
        setFeature(data.feature);

        // Fit the map view to this parish (only if map is ready)
        try {
          const tmpLayer = L.geoJSON(data.feature as any);
          const bounds = tmpLayer.getBounds();
          if (bounds.isValid()) {
            map.fitBounds(bounds, { padding: [40, 40] });
          }
        } catch (err) {
          console.error("Error fitting bounds:", err);
        }
      })
      .catch((err) => {
        console.error("Error loading parish boundary:", err);
      });
  }, [parishId, map, mapReady]);

  if (!feature) return null;

  return (
    <GeoJSON
      data={feature as any}
      style={() => ({
        color: "#ffffff",
        weight: 2,
        fillOpacity: 0.05,
      })}
    />
  );
}
