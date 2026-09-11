'use client';
import { useEffect, useRef, useState } from 'react';
import type { Map as LeafletMap, LayerGroup } from 'leaflet';
import type { Incident } from '@/lib/incidents';
import type { Place } from '@/lib/places';
import 'leaflet/dist/leaflet.css';
const colours = {
  fire: '#d83329',
  rescue: '#2678cc',
  storm: '#0b8c82',
  hazmat: '#9260ae',
  planned: '#a27637',
  other: '#687280',
};
export default function IncidentMap({
  incidents,
  warnings = [],
  place,
  onSelect,
}: {
  incidents: Incident[];
  warnings?: Incident[];
  place: Place | null;
  onSelect: (row: Incident) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const map = useRef<LeafletMap | null>(null);
  const layer = useRef<LayerGroup | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const latest = useRef(onSelect);
  useEffect(() => {
    latest.current = onSelect;
  }, [onSelect]);
  useEffect(() => {
    let cancelled = false;
    void import('leaflet')
      .then((L) => {
        if (cancelled || !host.current) return;
        const m = L.map(host.current, { scrollWheelZoom: false }).setView(
          [-37.2, 145],
          7,
        );
        map.current = m;
        L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution:
            '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
          maxZoom: 18,
        })
          .on('tileerror', () => setError(true))
          .addTo(m);
        layer.current = L.layerGroup().addTo(m);
        setReady(true);
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      map.current?.remove();
      map.current = null;
      layer.current = null;
    };
  }, []);
  useEffect(() => {
    if (!ready || !map.current || !layer.current) return;
    let cancelled = false;
    void import('leaflet').then((L) => {
      if (cancelled || !layer.current) return;
      const group = layer.current;
      group.clearLayers();
      for (const r of [...warnings, ...incidents]) {
        const color =
          r.kind === 'warning'
            ? r.level === 'Emergency Warning'
              ? '#c82324'
              : r.level === 'Watch and Act'
                ? '#dc7717'
                : '#b68a10'
            : colours[r.category];
        if (r.kind === 'warning' && r.geometry)
          L.geoJSON(r.geometry, {
            style: { color, weight: 2, fillOpacity: 0.1 },
            pointToLayer: (_, latlng) =>
              L.circleMarker(latlng, { radius: 10, color, fillOpacity: 0.7 }),
          })
            .on('click', () => latest.current(r))
            .addTo(group);
        if (r.point) {
          const marker = L.marker(r.point, {
            title: `${r.title}, ${r.location}`,
            keyboard: true,
            icon: L.divIcon({
              className: 'dispatch-marker',
              html: `<span style="background:${color}"></span>`,
              iconSize: [28, 28],
              iconAnchor: [14, 14],
            }),
          });
          const tooltip = document.createElement('span');
          tooltip.textContent = `${r.title} · ${r.location}`;
          marker
            .bindTooltip(tooltip)
            .on('click', () => latest.current(r))
            .addTo(group);
        }
      }
      if (place)
        L.circle([place.lat, place.lng], {
          radius: place.radius * 1000,
          color: '#59687d',
          weight: 1,
          dashArray: '5 6',
          fillOpacity: 0.035,
        }).addTo(group);
    });
    return () => {
      cancelled = true;
    };
  }, [incidents, warnings, place, ready]);
  useEffect(() => {
    if (!ready || !map.current) return;
    if (place)
      map.current.fitBounds(
        [
          [place.lat - place.radius / 111, place.lng - place.radius / 85],
          [place.lat + place.radius / 111, place.lng + place.radius / 85],
        ],
        { padding: [25, 25] },
      );
    else map.current.setView([-37.2, 145], 7);
  }, [place, ready]);
  return (
    <div className="map-wrap">
      <div
        ref={host}
        className="incident-map"
        aria-label="Map of public incidents in Victoria"
      />
      {error && (
        <output className="map-error">
          The background map may be unavailable. Incident details remain
          available in List view.
        </output>
      )}
      <div className="map-caption">
        Reported locations are approximate. A pin does not show the affected
        area.
      </div>
    </div>
  );
}
