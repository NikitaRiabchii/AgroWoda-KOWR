import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { Navigation } from 'lucide-react';
import type { ElevationProfile, HydrologyAnalysis, LatLng, ParcelGeometry } from '../types/water';

const POLAND_CENTER: LatLng = [52.1, 19.3];

const selectedPinIcon = L.divIcon({
  html: `<div style="width:26px;height:26px;border-radius:50%;background:#1abc9c;border:3px solid #fff;box-shadow:0 2px 10px rgba(26,188,156,0.65);"></div>`,
  className: '',
  iconSize: [26, 26],
  iconAnchor: [13, 13],
});

const retentionPinIcon = L.divIcon({
  html: `<div style="width:28px;height:28px;border-radius:50%;background:#3498db;border:3px solid #fff;box-shadow:0 2px 10px rgba(52,152,219,0.7);display:flex;align-items:center;justify-content:center;color:#fff;font-size:13px;font-weight:700;">R</div>`,
  className: '',
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

interface ParcelMapProps {
  parcel?: ParcelGeometry | null;
  selectedPoint?: { lat: number; lng: number } | null;
  flyTo?: { lat: number; lng: number; zoom?: number; ts: number } | null;
  elevation?: ElevationProfile | null;
  hydrology?: HydrologyAnalysis | null;
  onMapClick?: (lat: number, lng: number) => void;
  height?: string;
  interactive?: boolean;
}

export const ParcelMap: React.FC<ParcelMapProps> = ({
  parcel,
  selectedPoint,
  flyTo,
  elevation,
  hydrology,
  onMapClick,
  height = '420px',
  interactive = true,
}) => {
  const [baseLayer, setBaseLayer] = useState<'osm' | 'satellite'>('satellite');
  const [showEgib, setShowEgib] = useState(true);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const baseLayerRef = useRef<L.TileLayer | null>(null);
  const egibLayerRef = useRef<L.TileLayer.WMS | null>(null);
  const overlaysRef = useRef<L.LayerGroup | null>(null);
  const onMapClickRef = useRef(onMapClick);
  onMapClickRef.current = onMapClick;

  // Inicjalizacja czystej mapy Leaflet (licencja BSD-2-Clause)
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const initialCenter: LatLng = parcel
      ? [parcel.centroid.lat, parcel.centroid.lng]
      : selectedPoint
        ? [selectedPoint.lat, selectedPoint.lng]
        : POLAND_CENTER;
    const initialZoom = parcel ? 15 : selectedPoint ? 14 : 6;

    const map = L.map(el, {
      center: initialCenter,
      zoom: initialZoom,
      scrollWheelZoom: true,
    });
    const overlays = L.layerGroup().addTo(map);
    mapRef.current = map;
    overlaysRef.current = overlays;

    const handleClick = (e: L.LeafletMouseEvent) => {
      if (interactive && onMapClickRef.current) {
        onMapClickRef.current(Number(e.latlng.lat.toFixed(6)), Number(e.latlng.lng.toFixed(6)));
      }
    };
    map.on('click', handleClick);

    return () => {
      map.off('click', handleClick);
      map.remove();
      mapRef.current = null;
      baseLayerRef.current = null;
      egibLayerRef.current = null;
      overlaysRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interactive]);

  // Warstwa bazowa (Satelita Esri / Mapa OSM)
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (baseLayerRef.current) {
      map.removeLayer(baseLayerRef.current);
    }

    const layer =
      baseLayer === 'satellite'
        ? L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            attribution: '&copy; Esri World Imagery',
            maxZoom: 18,
          })
        : L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; OpenStreetMap',
            maxZoom: 19,
          });

    layer.addTo(map);
    layer.bringToBack();
    baseLayerRef.current = layer;
  }, [baseLayer]);

  // Warstwa granic działek GUGiK KIEG WMS
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (egibLayerRef.current) {
      map.removeLayer(egibLayerRef.current);
      egibLayerRef.current = null;
    }

    if (showEgib) {
      const wms = L.tileLayer.wms('https://integracja.gugik.gov.pl/cgi-bin/KrajowaIntegracjaEwidencjiGruntow', {
        layers: 'dzialki,numery_dzialek',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        opacity: 0.85,
        attribution: 'EGiB &copy; GUGiK',
      });
      wms.addTo(map);
      egibLayerRef.current = wms;
    }
  }, [showEgib]);

  // Warstwy wektorowe: obrys działki, spływ NMT, punkt mikroretencji R, cieki OSM
  useEffect(() => {
    const group = overlaysRef.current;
    if (!group) return;
    group.clearLayers();

    if (parcel && parcel.polygon.length >= 3) {
      const poly = L.polygon(parcel.polygon, {
        color: '#1abc9c',
        weight: 3.5,
        fillColor: '#1abc9c',
        fillOpacity: 0.25,
      });
      poly.bindTooltip(`${parcel.teryt ? `Działka ${parcel.teryt}` : 'Wybrany obszar'} (${parcel.areaHa} ha)`, { sticky: true });
      poly.addTo(group);
    }

    if (elevation?.flowVector) {
      const line = L.polyline(elevation.flowVector, {
        color: '#f39c12',
        weight: 4,
        dashArray: '7 5',
      });
      line.bindTooltip(`Kierunek spływu (${elevation.meanSlopePct}%, ${elevation.aspectLabelPl})`, { sticky: true });
      line.addTo(group);
    }

    if (elevation?.lowestPoint) {
      const marker = L.marker([elevation.lowestPoint.lat, elevation.lowestPoint.lng], { icon: retentionPinIcon });
      marker.bindTooltip(
        `Najniższy punkt NMT (${elevation.lowestPoint.elevationM} m n.p.m.) — proponowana mikroretencja`,
        { direction: 'top', offset: [0, -14] }
      );
      marker.addTo(group);
    }

    hydrology?.featuresForMap.forEach((f) => {
      const cm = L.circleMarker([f.lat, f.lng], {
        radius: 6.5,
        color: '#2980b9',
        fillColor: '#3498db',
        fillOpacity: 0.85,
        weight: 2,
      });
      cm.bindTooltip(`${f.labelPl}${f.name ? `: ${f.name}` : ''} (${f.distanceM} m)`);
      cm.addTo(group);
    });

    if (selectedPoint && !parcel) {
      L.marker([selectedPoint.lat, selectedPoint.lng], { icon: selectedPinIcon }).addTo(group);
    }
  }, [parcel, elevation, hydrology, selectedPoint]);

  // Dopasowanie widoku do obrysu działki
  useEffect(() => {
    const map = mapRef.current;
    if (map && parcel && parcel.polygon.length >= 3) {
      map.fitBounds(L.latLngBounds(parcel.polygon), { padding: [50, 50], maxZoom: 16 });
    }
  }, [parcel?.teryt, parcel?.centroid.lat, parcel?.centroid.lng]);

  // Płynne przejście do wybranego punktu / miejscowości
  useEffect(() => {
    const map = mapRef.current;
    if (map && flyTo) {
      map.flyTo([flyTo.lat, flyTo.lng], flyTo.zoom ?? 15, { duration: 0.6 });
    }
  }, [flyTo?.ts]);

  const handleGps = () => {
    if (!onMapClick || !('geolocation' in navigator)) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => onMapClick(Number(pos.coords.latitude.toFixed(6)), Number(pos.coords.longitude.toFixed(6))),
      () => {}
    );
  };

  return (
    <div className="space-y-3">
      <div className="no-print flex flex-wrap items-center justify-between gap-2 text-xs sm:text-[13px]">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setBaseLayer('satellite')}
            className={`px-3.5 py-2 rounded-[3px] border font-semibold transition ${
              baseLayer === 'satellite'
                ? 'bg-[#1abc9c] text-white border-[#1abc9c]'
                : 'bg-white text-[#55606e] border-[#d5dce3] hover:bg-[#f8fafc]'
            }`}
          >
            Satelita
          </button>
          <button
            type="button"
            onClick={() => setBaseLayer('osm')}
            className={`px-3.5 py-2 rounded-[3px] border font-semibold transition ${
              baseLayer === 'osm'
                ? 'bg-[#1abc9c] text-white border-[#1abc9c]'
                : 'bg-white text-[#55606e] border-[#d5dce3] hover:bg-[#f8fafc]'
            }`}
          >
            Mapa OSM
          </button>
          <button
            type="button"
            onClick={() => setShowEgib((v) => !v)}
            className={`px-3.5 py-2 rounded-[3px] border font-semibold transition ${
              showEgib
                ? 'bg-[#2c3e50] text-white border-[#2c3e50]'
                : 'bg-white text-[#55606e] border-[#d5dce3] hover:bg-[#f8fafc]'
            }`}
          >
            Granice działek (GUGiK)
          </button>
        </div>

        {interactive && onMapClick && (
          <button
            type="button"
            onClick={handleGps}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-[3px] border border-[#d5dce3] bg-white hover:bg-[#f8fafc] text-[#37474f] font-semibold transition"
          >
            <Navigation className="h-4 w-4 text-[#1abc9c]" /> Mój GPS
          </button>
        )}
      </div>

      <div className="relative rounded-[3px] overflow-hidden border border-[#d5dce3]">
        <div
          ref={containerRef}
          style={{ height, width: '100%' }}
          className={interactive ? 'cursor-crosshair z-10' : 'z-10'}
        />
      </div>

      {(elevation?.lowestPoint || (hydrology?.featuresForMap.length ?? 0) > 0) && (
        <div className="flex flex-wrap gap-5 text-[13px] text-[#6c757d]">
          <span className="inline-flex items-center gap-2">
            <span className="h-3 w-3 bg-[#1abc9c]/40 border-2 border-[#1abc9c]" /> Działka
          </span>
          {elevation?.flowVector && (
            <span className="inline-flex items-center gap-2">
              <span className="h-0.5 w-5 border-t-2 border-dashed border-[#f39c12]" /> Kierunek spływu (NMT)
            </span>
          )}
          {elevation?.lowestPoint && (
            <span className="inline-flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-[#3498db]" /> Punkt mikroretencji (R) / cieki
            </span>
          )}
        </div>
      )}
    </div>
  );
};
